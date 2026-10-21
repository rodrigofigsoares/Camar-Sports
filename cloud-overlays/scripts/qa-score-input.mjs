import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const bundle=await build({entryPoints:['src/domain/model.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {createMatch}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const server=createServer((req,res)=>{try {const path=resolve('dist','.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
try {
for(const viewport of [{width:1440,height:1100},{width:390,height:844}]) {
let match=createMatch('handball');match.id='qa-score';let writes=0;
const page=await browser.newPage({viewport});
await page.route('**/api/**',async route=>{
const req=route.request(),path=new URL(req.url()).pathname;
if(path==='/api/session') return route.fulfill({json:{user:{id:'qa',name:'QA',username:'qa',role:'admin',sports:[]},setup:false,serverTime:Date.now()}});
if(path==='/api/matches/qa-score') {
if(req.method()==='POST') {const data=req.postDataJSON();await new Promise(r=>setTimeout(r,350));if(data.revision!==match.revision) throw Error('Stale revision');const c=data.command;if(c.type==='score') match[c.side].score=Math.max(0,match[c.side].score+c.amount);else if(c.type==='setScore'){match.a.score=c.a;match.b.score=c.b;}match.revision++;writes++;}
return route.fulfill({json:match});
}return route.fulfill({json:[]});});
await page.goto(`http://127.0.0.1:${server.address().port}/#/matches/qa-score`);
const add=page.locator('.score-buttons').first().getByRole('button',{name:'1',exact:true});
await expect(add).toBeVisible();
await add.click({clickCount:5,delay:20});
await expect(page.locator('.big-score').first()).toHaveText('5');
await expect(page.getByRole('status')).toHaveText('Placar sincronizado');
if(match.a.score!==5||writes!==5) throw Error('Rapid points lost');
await page.getByRole('button',{name:'Ajustar placar diretamente'}).click();
await page.getByLabel('Placar EQUIPE A',{exact:true}).fill('32');
await page.getByLabel('Placar EQUIPE B',{exact:true}).fill('29');
await page.screenshot({path:`artifacts/score-adjust-${viewport.width}.png`,fullPage:true});
await page.getByRole('button',{name:'Aplicar placar',exact:true}).click();
await expect(page.locator('.big-score').first()).toHaveText('32');
await expect(page.locator('.big-score').nth(1)).toHaveText('29');
await expect(page.getByRole('status')).toHaveText('Placar sincronizado');
if(writes!==6||match.a.score!==32||match.b.score!==29) throw Error('Bulk correction failed');
console.log(viewport.width+': rapid clicks and one-write correction PASS');
await page.close();
}
} finally {await browser.close();server.close();}
