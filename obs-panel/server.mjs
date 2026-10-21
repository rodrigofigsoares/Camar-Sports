import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {OBS,switchMatch} from './obs.mjs';

export function createPanel({cloud='https://cloud-overlays.camarlabsports.workers.dev',obs=new OBS(),fetcher=fetch}={}) {
  let cookie='', user=null, matches=[], tournaments=[], busy=false;
  const cloudAPI = async (path, body) => {
    const response = await fetcher(cloud+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});
    const data = await response.json();
    if (response.status===401) {cookie='';user=null;}
    if (!response.ok) throw new Error(data.error || 'Falha na consulta ao Camar.');
    if (path==='login') {
      const token = response.headers.get('set-cookie')?.match(/camar_session=([a-f0-9]{64})/);
      if (!token) throw new Error('O Camar não retornou uma sessão válida.');
      cookie='camar_session='+token[1];
    }
    return data;
  };
  const server = http.createServer(async(req,res)=>{
    const host=`127.0.0.1:${server.address().port}`;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(req.headers.host!==host) return send(403,{error:'Endereço local inválido.'});
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' ws://127.0.0.1:*; frame-ancestors 'none'");
    try {
      const path=new URL(req.url,'http://'+host).pathname;
      const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/obs-client.js':'obs-client.js','/filters.js':'filters.js'};
      if(req.method==='GET' && files[path]) {
        const content=await readFile(new URL('./public/'+files[path],import.meta.url));
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(content);
      }
      if(req.method!=='POST'||req.headers.origin!=='http://'+host||req.headers['content-type']!=='application/json') return send(403,{error:'Abra o painel pelo endereço local.'});
      let raw=''; for await(const chunk of req){raw+=chunk;if(raw.length>12000) throw new Error('Pedido muito grande.');}
      const body=JSON.parse(raw||'{}');
      if(path==='/api/status') return send(200,{user:user?{name:user.name}:null,obs:obs.ready,cloud});
      if(busy) return send(409,{error:'Aguarde a operação atual terminar.'});
      busy=true;
      try {
        if(path==='/api/login') { user=await cloudAPI('login',{username:body.username,password:body.password});matches=[];tournaments=[];return send(200,{name:user.name}); }
        if(path==='/api/logout') {try{if(cookie)await cloudAPI('logout',{});}finally{cookie='';user=null;matches=[];tournaments=[];}return send(200,{ok:true});}
        if(path==='/api/matches') {
          if(!user) throw new Error('Entre no Camar para consultar as partidas.');
          const result=await Promise.all([cloudAPI('matches'),cloudAPI('tournaments')]);
          [matches,tournaments]=result;return send(200,{matches,tournaments});
        }
        if(path==='/api/connect') {
          const port=Number(body.port);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Porta inválida.');
          await obs.connect(port,String(body.password||''));return send(200,{ok:true});
        }
        if(path==='/api/sources') {
          const {inputs}=await obs.call('GetInputList',{inputKind:'browser_source'});
          return send(200,{inputs});
        }
        if(path==='/api/source') return send(200,await obs.call('GetInputSettings',{inputName:String(body.inputName)}));
        if(path==='/api/switch') {
          if(!user||!matches.some(m=>m.id===body.matchId))throw new Error('Atualize a lista e selecione uma partida válida.');
          return send(200,await switchMatch(obs,String(body.inputName),cloud+'/#/overlay/match/'+encodeURIComponent(body.matchId)));
        }
        return send(404,{error:'Operação desconhecida.'});
      } finally {busy=false;}
    }catch(error){send(400,{error:error.name==='TimeoutError'?'A conexão demorou demais. Tente novamente.':error.message});}
  });
  server.on('close',()=>obs.close());
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const server=createPanel();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'O painel já está aberto na porta 3210.':e.message);process.exitCode=1;});
  server.listen(3210,'127.0.0.1',()=>console.log('Painel Camar: http://127.0.0.1:3210\nMantenha este processo aberto enquanto usa o painel.'));
}
