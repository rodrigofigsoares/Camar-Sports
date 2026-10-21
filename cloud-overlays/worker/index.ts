import { z } from 'zod';
import { createApi } from './api';
import { auth, session } from './auth';
import { D1Repository } from './repository';
import { HttpError, json, type Env } from './types';
import { finishExpiredMatch } from '../src/domain/scoring';
import type { Match } from '../src/domain/model';
import { connectLive, notifyCommitted } from './live';
export { LiveRoom } from './live-room';

async function limitedBody(req: Request) {
  const reader=req.body?.getReader();
  const chunks:Uint8Array[]=[];let size=0;
  if(reader) for(;;) {
    const {done,value}=await reader.read();if(done) break;
    size+=value.byteLength;
    if(size>1_500_000) {await reader.cancel();throw new HttpError(413,'Arquivo excede 1,5 MB.');}
    chunks.push(value);
  }
  const result=new Uint8Array(size);let offset=0;
  for(const chunk of chunks) {result.set(chunk,offset);offset+=chunk.byteLength;}
  return result;
}

function tagged(value: unknown, generation: number, matches: Match[]) {
  let deadline = Date.now()+30000;
  for (const m of matches) {
    if (m.clock.startedAt === null || m.status === 'done') continue;
    const remaining=m.clock.direction==='down'?m.clock.value:(m.clock.limit||86400)-m.clock.value;
    const end=m.clock.startedAt+Math.max(0,remaining)*1000;
    if (end>Date.now()) deadline=Math.min(deadline,end);
  }
  return json(value,200,{ETag:`"${generation}-${deadline}"`});
}

async function read(req: Request, env: Env, ctx: ExecutionContext): Promise<Response | undefined> {
  const url = new URL(req.url), [, ,resource, entityId] = url.pathname.split('/');
  if (resource !== 'matches' && resource !== 'tournaments') return;
  const kind = resource === 'matches' ? 'match' : 'tournament';
  if (!entityId && !url.searchParams.get('tournament') && !(await session(req,env)))
    throw new HttpError(401,'Entre para listar seus dados.');
  const version=await env.DB.prepare('SELECT version FROM generation WHERE id=1').first<{version:number}>();
  const previous=/^(?:W\/)?"(\d+)-(\d+)"$/.exec(req.headers.get('If-None-Match')??'');
  if (previous && Number(previous[1])===version?.version && Number(previous[2])>Date.now())
    return new Response(null,{status:304,headers:{'Cache-Control':'no-store',ETag:previous[0]}});
  if (resource==='tournaments' && entityId && url.pathname.endsWith('/state')) {
    const repo=await D1Repository.load(env.DB,'tournaments',entityId);
    if (!repo.get('tournament',entityId)) throw new HttpError(404,'Campeonato não encontrado.');
    createApi(repo).expire(); await repo.commit();
    if (repo.changedRooms.size) notifyCommitted(repo,env,ctx);
    const matches=repo.list<Match>('match');
    return tagged({tournament:repo.get('tournament',entityId),matches},repo.generation,matches);
  }
  let sql = 'SELECT payload FROM entities WHERE kind=?';
  const args: string[] = [kind];
  if (entityId) { sql += ' AND id=?'; args.push(entityId); }
  else if (url.searchParams.has('tournament')) { sql += ' AND tournament_id=?'; args.push(url.searchParams.get('tournament')!); }
  sql += ' ORDER BY rowid DESC';
  const snapshot=await env.DB.batch([env.DB.prepare('SELECT version FROM generation WHERE id=1'),env.DB.prepare(sql).bind(...args)]);
  let generation=(snapshot[0].results[0] as {version:number}).version;
  let rows = snapshot[1].results as {payload:string}[];
  if (kind === 'match') {
    const expired = rows.map(r => JSON.parse(r.payload) as Match).filter(m => finishExpiredMatch(m));
    if (expired.length) {
      // Resolve elapsed clocks when next observed; no per-second database writes.
      const tournament = url.searchParams.get('tournament');
      const repo = await D1Repository.load(env.DB,tournament ? 'tournaments' : entityId ? 'matches' : 'backup',tournament ?? entityId);
      createApi(repo).expire();
      await repo.commit();
      notifyCommitted(repo,env,ctx);
      const updated=await env.DB.batch([env.DB.prepare('SELECT version FROM generation WHERE id=1'),env.DB.prepare(sql).bind(...args)]);
      generation=(updated[0].results[0] as {version:number}).version;
      rows=updated[1].results as {payload:string}[];
    }
  }
  if (entityId && !rows.length) throw new HttpError(404,'Registro não encontrado.');
  const values=rows.map(r=>JSON.parse(r.payload));
  return tagged(entityId ? values[0] : values,generation,kind==='match'?values:[]);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (url.pathname==='/api/live') return await connectLive(req,env);
      const [, ,resource,entityId,action,...rest] = url.pathname.split('/');
      const methods: Record<string,string[]> = {
        session:['GET'],login:['POST'],setup:['POST'],logout:['POST'],
        users:['GET','POST','DELETE'],backup:['GET','POST'],matches:['GET','POST','DELETE'],tournaments:['GET','POST','PUT','DELETE'],
      };
      if (!methods[resource] || rest.length || (action && !(resource==='matches' && action==='undo' && req.method==='POST') && !(resource==='tournaments' && action==='state' && req.method==='GET')))
        throw new HttpError(404,'Rota não encontrada.');
      if (!methods[resource].includes(req.method)) throw new HttpError(405,'Método não permitido.');
      if (req.method !== 'GET') {
        const origin = req.headers.get('Origin');
        if (origin && origin !== url.origin) throw new HttpError(403,'Origem não permitida.');
        const length = Number(req.headers.get('Content-Length') ?? 0);
        if (length > 1_500_000) throw new HttpError(413,'Arquivo excede 1,5 MB.');
        const buffer = await limitedBody(req);
        if (buffer.byteLength > 1_500_000) throw new HttpError(413,'Arquivo excede 1,5 MB.');
        req = new Request(req,{body:buffer});
      }
      const authentication = await auth(req,env,resource);
      if (authentication) return authentication;
      if (req.method === 'GET') {
        const response = await read(req,env,ctx);
        if (response) return response;
      }
      const user = await session(req,env);
      if (!user) throw new HttpError(401,'Entre com seu perfil para continuar.');
      if ((resource==='users' || resource==='backup') && user.role !== 'admin')
        throw new HttpError(403,'Acesso reservado ao administrador.');
      const repo = await D1Repository.load(env.DB,resource,entityId,true);
      const response = await createApi(repo,user).handle(req);
      if (response.ok && req.method !== 'GET') {
        await repo.commit();
        notifyCommitted(repo,env,ctx);
      }
      return response;
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return json({error:'Dados inválidos.'},400);
      console.error('Cloud API failure',error);
      return json({error:'Serviço indisponível. Tente novamente em instantes.'},503);
    }
  },
};
