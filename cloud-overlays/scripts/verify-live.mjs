import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';

const base='https://cloud-overlays.camarlabsports.workers.dev';
const resource=process.argv[2];
if(!/^(matches|tournaments)\/[a-zA-Z0-9_-]+(?:\/state)?$/.test(resource??'')) throw new Error('Informe o recurso de leitura a verificar.');
const read=await fetch(base+'/api/'+resource);assert.equal(read.status,200);
const endpoint=new URL('/api/live',base);endpoint.protocol='wss:';endpoint.searchParams.set('resource',resource);
async function check() {
  const start=performance.now(),socket=new WebSocket(endpoint);
  try {
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('WebSocket handshake timed out')),15000);
      socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('WebSocket failed'));},{once:true});
    });
    const handshakeMs=Math.round(performance.now()-start),pingStart=performance.now();
    const pong=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Heartbeat timed out')),10000);
      socket.addEventListener('message',e=>{if(e.data==='pong'){clearTimeout(timeout);resolve();}});
    });
    socket.send('ping');await pong;
    return {handshakeMs,pingRoundTripMs:Math.round(performance.now()-pingStart)};
  } finally {socket.close(1000);}
}
const clients=await Promise.all([check(),check()]);
const report={verifiedAt:new Date().toISOString(),url:base,resource,clients,check:'two production WebSocket connections and auto-response; no scores changed'};
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/live-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
