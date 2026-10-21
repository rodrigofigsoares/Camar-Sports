import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const bundle=await build({entryPoints:['src/domain/model.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {createMatch}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const root=resolve(process.argv[2]||'.');
const server=createServer((req,res)=>{try {const path=resolve(root,'dist','.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
try {
for(const viewport of [{width:1440,height:1100}]) {
let match=createMatch('handball');match.id='qa-score';let writes=0;
const page=await browser.newPage({viewport});
await page.route('**/api/**',async route=>{
const req=route.request(),path=new URL(req.url()).pathname;
if(path==='/api/session') return route.fulfill({json:{user:{id:'qa',name:'QA',username:'qa',role:'admin',sports:[]},setup:false,serverTime:Date.now()}});
if(path==='/api/matches/qa-score') {
if(req.method()==='POST') {const data=req.postDataJSON();await new Promise(r=>setTimeout(r,350));if(data.revision!==match.revision) throw Error('Stale revision');const c=data.command;if(c.type==='sevenMeters')match.handballCue={id:crypto.randomUUID(),kind:'seven',side:c.side,at:Date.now()-1000};else if(c.type==='score') match[c.side].score=Math.max(0,match[c.side].score+c.amount);else if(c.type==='setScore'){match.a.score=c.a;match.b.score=c.b;}match.revision++;writes++;}
return route.fulfill({json:match});
}return route.fulfill({json:[]});});
await page.goto(`${process.argv[3] || `http://127.0.0.1:${server.address().port}`}/#/matches/qa-score`);
await expect(page.locator('.v21-canvas')).toBeVisible();
await page.waitForTimeout(900);
await page.evaluate(()=>{
 window.__frames=[];
 let node=null,start=0;
 function sample(t){
  const current=document.querySelector('.v1-handball-seven');
  if(current&&current!==node){node=current;start=t;}
  if(current){const cs=getComputedStyle(current);window.__frames.push({ms:t-start,opacity:+cs.opacity,clip:cs.clipPath});}
  requestAnimationFrame(sample);
 }
 requestAnimationFrame(sample);
});
await page.getByRole('button',{name:'7m · Exibir 7 METROS!',exact:true}).first().click();
await page.waitForTimeout(1200);
const frames=await page.evaluate(()=>window.__frames);
const first=frames[0],middle=frames.find(f=>f.ms>=150),full=frames.find(f=>f.ms>=650);
if(!first||first.opacity>.1||!middle||middle.opacity<=0||middle.opacity>=1||!full||full.opacity<.99)throw Error(JSON.stringify({first,middle,full}));
console.log(JSON.stringify({root,first,middle,full,frames:frames.length}));
await page.close();
}
} finally {await browser.close();server.close();}
