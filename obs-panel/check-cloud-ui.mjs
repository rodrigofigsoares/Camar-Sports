import {chromium} from '../cloud-overlays/node_modules/playwright/index.mjs';
import {WebSocketServer} from '../cloud-overlays/node_modules/ws/wrapper.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=s=>createHash('sha256').update(s).digest('base64');
const wss=new WebSocketServer({host:'127.0.0.1',port:0});
await new Promise(r=>wss.once('listening',r));
let switched;
const settings={url:'old',width:1920,height:1080,css:'custom',is_local_file:false};
wss.on('connection',socket=>{
  socket.send(JSON.stringify({op:0,d:{authentication:{salt:'salt',challenge:'challenge'}}}));
  socket.on('message',raw=>{
    const {op,d}=JSON.parse(raw);
    if(op===1){assert.equal(d.authentication,hash(hash('test-obs-password'+'salt')+'challenge'));socket.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));return;}
    let responseData={};
    if(d.requestType==='GetInputList')responseData={inputs:[{inputName:'Placar',inputKind:'browser_source'}]};
    if(d.requestType==='SetInputSettings'){switched=d.requestData;Object.assign(settings,switched.inputSettings);}
    if(d.requestType==='GetInputSettings')responseData={inputKind:'browser_source',inputSettings:settings};
    socket.send(JSON.stringify({op:7,d:{requestId:d.requestId,requestStatus:{result:true},responseData}}));
  });
});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:440,height:900}});
  const base=process.env.PANEL_URL||'https://panel.test';
  // Models the user's explicit Allow choice in the browser's local-network prompt.
  await page.context().grantPermissions(['local-network-access'],{origin:base});
  let user=null;const requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')console.log('Browser:',message.text());});
  await page.route(base+'/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(!path.startsWith('/api/')){
      if(process.env.PANEL_URL)return route.continue();
      const filename=path==='/'?'index.html':path.slice(1);
      return route.fulfill({body:await readFile(new URL('./public/'+filename,import.meta.url)),contentType:filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html',headers:{'Content-Security-Policy':"default-src 'self'; connect-src 'self' ws://127.0.0.1:*"}});
    }
    requests.push({path,body:route.request().postDataJSON()});let data={};
    if(path==='/api/status')data={user,cloud:'https://cloud-overlays.camarlabsports.workers.dev'};
    if(path==='/api/login'){user={name:'Operador'};data=user;}
    if(path==='/api/matches')data={matches:[{id:'one',a:{team:{name:'Camar'}},b:{team:{name:'Visitante'}},status:'scheduled',category:'Adulto',tournamentId:'cup',title:'Final',venue:'Quadra 1'},{id:'two',a:{team:{name:'Azul'}},b:{team:{name:'Verde'}},status:'done',category:'Juvenil'}],tournaments:[{id:'cup',name:'Copa Camar'}]};
    await route.fulfill({json:data});
  });
  await page.goto(base);
  await page.locator('#username').fill('operador');await page.locator('#password').fill('test-camar-password');await page.getByRole('button',{name:'Entrar no Camar'}).click();
  await page.locator('.match').first().waitFor();assert.equal(await page.locator('.match').count(),2);
  await page.locator('#port').fill(String(wss.address().port));await page.locator('#obs-password').fill('test-obs-password');
  await page.getByRole('button',{name:'Conectar ao OBS',exact:true}).click();
  try{await page.locator('#source option[value="Placar"]').waitFor({state:'attached',timeout:15000});}catch(e){console.log('Connection:',await page.locator('#notice').textContent());throw e;}
  await page.locator('#source').selectOption('Placar');
  await page.locator('#origin').selectOption('Partidas avulsas');assert.equal(await page.locator('.match').count(),1);
  assert.match(await page.locator('.teams').textContent(),/Azul/);
  await page.getByRole('button',{name:'Limpar filtros'}).click();assert.equal(await page.locator('.match').count(),2);
  await page.locator('#search-field').selectOption('venue');await page.locator('#search').fill('quadra');assert.equal(await page.locator('.match').count(),1);
  await page.getByRole('button',{name:'Limpar filtros'}).click();
  await page.locator('#tournament').selectOption('Partidas avulsas');
  await page.locator('#status').selectOption('Encerrada');
  await page.getByRole('button',{name:'Exibir no placar',exact:true}).click();await page.locator('.match.active').waitFor();
  assert.deepEqual(switched,{inputName:'Placar',inputSettings:{url:'https://cloud-overlays.camarlabsports.workers.dev/#/overlay/match/two'},overlay:true});
  assert.equal(settings.width,1920);assert.equal(settings.css,'custom');
  assert.ok(requests.every(r=>!['/api/connect','/api/switch','/api/sources','/api/source'].includes(r.path)));
  assert.equal(JSON.stringify(requests).includes('test-obs-password'),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.locator('#settings summary').click();await page.screenshot({path:new URL('./preview-cloud.png',import.meta.url).pathname.slice(1).split('/').map(decodeURIComponent).join('/'),fullPage:true});
  console.log('HTTPS UI passed: standalone matches, targeted search, dropdowns, clear filters, direct OBS authentication, URL-only update; OBS password never sent to cloud.');
}finally{await browser.close();for(const socket of wss.clients)socket.terminate();await new Promise(r=>wss.close(r));}
