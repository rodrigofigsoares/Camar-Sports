import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=(await readFile('worker.mjs','utf8')).replace('type:error.name','type:error.name,message:error.message');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-09-23',serviceBindings:{CAMAR:async request=>{
  const path=new URL(request.url).pathname;
  if(path==='/api/login')return Response.json({name:'Operador'},{headers:{'Set-Cookie':'camar_session='+'a'.repeat(64)}});
  if(path==='/api/session')return Response.json({user:{name:'Operador'}});
  if(path==='/api/matches')return Response.json([{id:'1',a:{team:{name:'A'}},b:{team:{name:'B'}}}]);
  return Response.json([]);
}}}));
try{
  const request=(path,body={},cookie='')=>mf.dispatchFetch('https://panel.test/api/'+path,{method:'POST',headers:{Origin:'https://panel.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  assert.equal((await request('matches')).status,401);
  const login=await request('login',{username:'operador',password:'test-password'});assert.equal(login.status,200);
  const cookie=login.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);
  const data=await(await request('matches',{},cookie)).json();assert.equal(data.matches[0].id,'1');
  console.log('Cloudflare runtime: login, cookie, service binding and protected listing passed.');
}finally{await mf.dispose();}
