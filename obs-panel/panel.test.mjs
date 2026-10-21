import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPanel} from './server.mjs';
import {switchMatch,OBS} from './obs.mjs';

test('troca somente URL e confirma leitura; recusa arquivos locais e outras fontes',async()=>{
  const settings={url:'old',width:1920,height:1080,css:'body {}',is_local_file:false};const calls=[];
  const obs={call:async(type,data)=>{calls.push([type,data]);if(type==='SetInputSettings')Object.assign(settings,data.inputSettings);return {inputKind:'browser_source',inputSettings:{...settings}};}};
  await switchMatch(obs,'Placar','https://example.com/#/overlay/match/1');
  assert.deepEqual(calls[1],['SetInputSettings',{inputName:'Placar',inputSettings:{url:'https://example.com/#/overlay/match/1'},overlay:true}]);
  assert.equal(settings.width,1920);assert.equal(settings.css,'body {}');assert.equal(calls.length,3);
  settings.is_local_file=true;await assert.rejects(switchMatch(obs,'Placar','new'),/arquivo local/);
  await assert.rejects(switchMatch({call:async()=>({inputKind:'image_source'})},'x','new'),/navegador/);
  await assert.rejects(switchMatch({call:async()=>({inputKind:'browser_source',inputSettings:{url:'other'}})},'x','new'),/mudou/);
});

test('API integrada: sessão, lista, segurança de origem e troca por ID conhecido',async t=>{
  const remote=[];const settings={url:'old',width:1920};
  const obs={ready:true,close(){},async call(type,data){if(type==='SetInputSettings')Object.assign(settings,data.inputSettings);return {inputKind:'browser_source',inputSettings:{...settings}};}};
  const fetcher=async(url,init)=>{remote.push({url,init});const path=new URL(url).pathname;return Response.json(path==='/api/login'?{name:'Operador'}:path==='/api/matches'?[{id:'match 1'}]:[],{headers:path==='/api/login'?{'set-cookie':'camar_session='+'a'.repeat(64)+'; HttpOnly'}:{}});};
  const server=createPanel({obs,fetcher});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const request=(path,body={},origin=base)=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await request('login',{},'https://foreign.test')).status,403);assert.equal(remote.length,0);
  assert.equal((await request('matches')).status,400);
  assert.equal((await request('login',{username:'operator',password:'not-persisted'})).status,200);
  const status=await(await request('status')).json();assert.deepEqual(status.user,{name:'Operador'});assert.equal(JSON.stringify(status).includes('aaaa'),false);
  assert.equal((await request('matches')).status,200);assert.equal(remote[1].init.headers.Cookie,'camar_session='+'a'.repeat(64));
  assert.equal((await request('switch',{inputName:'Placar',matchId:'unknown'})).status,400);
  assert.equal((await request('switch',{inputName:'Placar',matchId:'match 1'})).status,200);
  assert.equal(settings.url,'https://cloud-overlays.camarlabsports.workers.dev/#/overlay/match/match%201');assert.equal(settings.width,1920);
  assert.equal(remote.filter(x=>x.init.method==='POST').length,1);
});

test('protocolo OBS autentica e correlaciona respostas e erros',async()=>{
  class Socket extends EventTarget {
    constructor(){super();queueMicrotask(()=>this.emit({op:0,d:{authentication:{salt:'salt',challenge:'challenge'}}}));}
    emit(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
    send(raw){const {op,d}=JSON.parse(raw);if(op===1){assert.equal(typeof d.authentication,'string');assert.equal(d.eventSubscriptions,0);queueMicrotask(()=>this.emit({op:2,d:{}}));}else queueMicrotask(()=>this.emit({op:7,d:{requestId:d.requestId,requestStatus:{result:d.requestType!=='Fail',comment:'rejected'},responseData:{inputs:[]}}}));}
    close(){this.dispatchEvent(new Event('close'));}
  }
  const obs=new OBS(Socket);await obs.connect(4455,'password');assert.equal(obs.ready,true);assert.deepEqual(await obs.call('GetInputList'),{inputs:[]});await assert.rejects(obs.call('Fail'),/rejected/);obs.close();assert.equal(obs.ready,false);
});
