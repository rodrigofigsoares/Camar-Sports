const CLOUD='https://cloud-overlays.camarlabsports.workers.dev';
const COOKIE='__Host-camar_obs';
const clearCookie=`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
class APIError extends Error {constructor(message,status){super(message);this.status=status;}}
async function readJSON(request){
  const reader=request.body?.getReader();if(!reader)return {};
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new APIError('Pedido muito grande.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new APIError('Dados inválidos.',400);}
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    const allowed=['/api/status','/api/login','/api/logout','/api/matches'];
    if(!allowed.includes(url.pathname))return json({error:'Operação desconhecida.'},404);
    if(request.method!=='POST')return json({error:'Método não permitido.'},405);
    if(request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')!=='application/json')return json({error:'Abra o painel pelo endereço publicado.'},403);
    const token=/(?:^|;\s*)__Host-camar_obs=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
    // Only fixed API routes are exposed. No OBS password or commands reach this Worker.
    const upstream=async(path,body)=>{
      const headers=new Headers({'Content-Type':'application/json'});
      if(token)headers.set('Cookie','camar_session='+token);
      const ip=request.headers.get('CF-Connecting-IP');if(ip)headers.set('CF-Connecting-IP',ip);
      const response=await env.CAMAR.fetch(new Request(CLOUD+'/api/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)}));
      if(response.status>=300&&response.status<400)throw new APIError('O Camar retornou um redirecionamento inesperado.',502);
      if(!response.ok){let message='Camar indisponível. Tente novamente.';try{const data=await response.json();if(typeof data.error==='string')message=data.error;}catch{}throw new APIError(message,response.status);}
      return response;
    };
    try{
      const body=await readJSON(request);
      if(url.pathname==='/api/status'){
        if(!token)return json({user:null,cloud:CLOUD});
        const {user}=await(await upstream('session')).json();
        return json({user:user?{name:user.name}:null,cloud:CLOUD},200,user?{}:{'Set-Cookie':clearCookie});
      }
      if(url.pathname==='/api/login'){
        if(typeof body?.username!=='string'||body.username.length<3||body.username.length>40||typeof body.password!=='string'||body.password.length<8||body.password.length>200)throw new APIError('Informe seu usuário e senha do Camar.',400);
        const response=await upstream('login',{username:body.username,password:body.password});
        const session=response.headers.get('Set-Cookie')?.match(/camar_session=([a-f0-9]{64})/);
        if(!session)throw new APIError('O Camar não retornou uma sessão válida.',502);
        const user=await response.json();
        return json({name:user.name},200,{'Set-Cookie':`${COOKIE}=${session[1]}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`});
      }
      if(url.pathname==='/api/logout'){
        try{if(token)await upstream('logout',{});}catch{}
        return json({ok:true},200,{'Set-Cookie':clearCookie});
      }
      if(!token)throw new APIError('Entre no Camar para consultar as partidas.',401);
      const responses=await Promise.all([upstream('matches'),upstream('tournaments')]);
      const [matches,tournaments]=await Promise.all(responses.map(r=>r.json()));
      const side=s=>({team:{name:s.team.name,shortName:s.team.shortName},score:s.score,sets:s.sets,games:s.games,points:s.points});
      return json({matches:matches.map(m=>({id:m.id,title:m.title,status:m.status,sport:m.sport,tournamentId:m.tournamentId,stageId:m.stageId,scheduledAt:m.scheduledAt,category:m.category,venue:m.venue,setHistory:m.setHistory,a:side(m.a),b:side(m.b)})),tournaments:tournaments.map(t=>({id:t.id,name:t.name,organizer:t.organizer,stages:t.stages?.map(s=>({id:s.id,name:s.name,groupId:s.groupId,matchIds:s.matchIds})),groups:t.groups?.map(g=>({id:g.id,name:g.name}))}))});
    }catch(error){
      if(error instanceof APIError)return json({error:error.message},error.status,error.status===401?{'Set-Cookie':clearCookie}:{});
      console.error(JSON.stringify({event:'panel_request_failed',path:url.pathname,type:error.name}));
      return json({error:'Não foi possível acessar o Camar. Tente novamente em instantes.'},502);
    }
  }
};
