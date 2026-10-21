import type { Env } from './types';
import { HttpError } from './types';
import type { D1Repository } from './repository';

export async function connectLive(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    throw new HttpError(426, 'Conexão WebSocket necessária.');
  const origin=req.headers.get('Origin');
  if (origin && origin!==url.origin) throw new HttpError(403,'Origem não permitida.');
  const resource=url.searchParams.get('resource')??'';
  const match=/^(matches|tournaments)\/([a-zA-Z0-9_-]{1,128})(?:\/state)?$/.exec(resource);
  if (!match) throw new HttpError(400,'Recurso de transmissão inválido.');
  const kind=match[1]==='matches'?'match':'tournament';
  const row=await env.DB.prepare('SELECT tournament_id FROM entities WHERE kind=? AND id=?')
    .bind(kind,match[2]).first<{tournament_id:string|null}>();
  if (!row) throw new HttpError(404,'Registro não encontrado.');
  const room=kind==='tournament'?`tournament:${match[2]}`:row.tournament_id?`tournament:${row.tournament_id}`:`match:${match[2]}`;
  return env.LIVE_ROOMS.getByName(room).fetch(req);
}

export function notifyCommitted(repo: D1Repository, env: Env, ctx: ExecutionContext) {
  // Large imports still recover through the client reconciliation timer; keep
  // the number of subrequests below Workers Free's 50-per-invocation limit.
  const rooms=[...repo.changedRooms];
  if (rooms.length>20) console.warn(JSON.stringify({event:'live_import_fallback',rooms:rooms.length}));
  ctx.waitUntil(Promise.allSettled(rooms.slice(0,20).map(room=>env.LIVE_ROOMS.getByName(room).notify()))
    .then(results=>{
      if(results.some(r=>r.status==='rejected')) console.error(JSON.stringify({event:'live_notification_failed'}));
    }));
}
