import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
const base='https://panel.test';
const call=(path,body={},cookie='',origin=base)=>new Request(base+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'CF-Connecting-IP':'192.0.2.10'},body:JSON.stringify(body)});

test('Worker keeps users isolated, never exposes token and only allows read routes',async()=>{
  const calls=[];
  const env={CAMAR:{async fetch(req){
    const path=new URL(req.url).pathname;calls.push({path,method:req.method,cookie:req.headers.get('Cookie'),ip:req.headers.get('CF-Connecting-IP')});
    if(path==='/api/login'){const body=await req.json();return Response.json({name:body.username},{headers:{'Set-Cookie':'camar_session='+(body.username==='alice'?'a':'b').repeat(64)}});}
    if(path==='/api/session')return Response.json({user:{name:req.headers.get('Cookie').includes('aaaa')?'Alice':'Bob'}});
    if(path==='/api/matches')return Response.json([{id:'1',a:{team:{name:'A'}},b:{team:{name:'B'}},history:['unneeded']}]);
    if(path==='/api/tournaments')return Response.json([{id:'t',name:'Cup',extra:'unneeded'}]);
    return Response.json({ok:true});
  }}};
  assert.equal((await worker.fetch(call('matches'),env)).status,401);assert.equal(calls.length,0);
  assert.equal((await worker.fetch(call('login',{username:'alice',password:'test-password'},'', 'https://other.test'),env)).status,403);
  assert.equal((await worker.fetch(call('switch',{password:'must-not-forward'}),env)).status,404);
  const a=await worker.fetch(call('login',{username:'alice',password:'test-password'}),env);
  const b=await worker.fetch(call('login',{username:'bobby',password:'test-password'}),env);
  const cookieA=a.headers.get('Set-Cookie'),cookieB=b.headers.get('Set-Cookie');
  assert.match(cookieA,/HttpOnly; Secure; SameSite=Strict; Path=\//);
  assert.deepEqual(await a.json(),{name:'alice'});
  assert.equal((await(await worker.fetch(call('status',{},cookieA),env)).json()).user.name,'Alice');
  assert.equal((await(await worker.fetch(call('status',{},cookieB),env)).json()).user.name,'Bob');
  assert.equal((await(await worker.fetch(call('status'),env)).json()).user,null);
  const data=await(await worker.fetch(call('matches',{},cookieA),env)).json();
  assert.equal(data.matches[0].history,undefined);assert.equal(data.tournaments[0].extra,undefined);
  assert.ok(calls.filter(c=>c.path==='/api/matches'||c.path==='/api/tournaments').every(c=>c.method==='GET'));
  assert.ok(calls.every(c=>c.ip==='192.0.2.10'));
  const logout=await worker.fetch(call('logout',{},cookieA),env);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});

test('Worker rejects oversized input and clears expired session',async()=>{
  const env={CAMAR:{fetch:async()=>Response.json({error:'Entre novamente.'},{status:401})}};
  assert.equal((await worker.fetch(call('login',{username:'alice',password:'x'.repeat(5000)}),env)).status,413);
  const r=await worker.fetch(call('matches',{},'__Host-camar_obs='+'c'.repeat(64)),env);
  assert.equal(r.status,401);assert.match(r.headers.get('Set-Cookie'),/Max-Age=0/);
});
