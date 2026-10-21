import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.argv[2]||'.');
const bundle=await build({entryPoints:[resolve(root,'src/domain/model.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {createMatch}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const dist=resolve(root,'dist');
const server=createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=resolve(dist,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!file.startsWith(dist+sep)) throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
const reports=[];
try {
for(const reducedMotion of ['no-preference','reduce']) for(const kind of ['seven','set','goal','victory']) {
const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion});
await page.addInitScript(()=>{
window.__notify=()=>{for(const fn of window.__listeners)fn();};window.__listeners=[];
window.EventSource=class {constructor(){window.__listeners.push(()=>this.onmessage?.({data:'{}'}));}close(){}};
window.WebSocket=class {static OPEN=1;readyState=1;constructor(){window.__listeners.push(()=>this.onmessage?.({data:'{"type":"changed"}'}));setTimeout(()=>this.onopen?.(),0);}send(){}close(){this.readyState=3;}};
});
let match=createMatch(kind==='goal'?'futsal':kind==='set'?'volleyball':'handball');match.id='animation-qa';
await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/session'?{user:null,setup:false,serverTime:Date.now()}:match});});
await page.goto(`http://127.0.0.1:${server.address().port}/#/overlay/match/animation-qa`);
await expect(page.locator('.v21-canvas')).toBeVisible();await page.waitForTimeout(900);
const cue={id:'delayed-cue',side:'a',kind,at:Date.now()-1000};
match.handballCue=cue;match.revision++;
if(kind==='victory'){match.status='done';match.a.score=1;match.victoryCue=cue;}
await page.evaluate(()=>window.__notify());
const panel=page.locator('.v1-handball-cue');await expect(panel).toBeAttached();
const samples=await panel.evaluate(el=>{
const animation=el.getAnimations()[0];if(!animation)throw Error('No cue animation');
const delay=getComputedStyle(el).animationDelay;
const values=[0,150,700].map(ms=>{animation.pause();animation.currentTime=ms;const s=getComputedStyle(el);return {ms,opacity:+s.opacity,transform:s.transform,clip:s.clipPath};});
animation.currentTime=150;return {delay,values};});
if(samples.delay!=='0s')throw Error(`${kind}: network latency skipped entrance (${samples.delay})`);
if(samples.values[0].opacity!==0||!(samples.values[1].opacity>0&&samples.values[1].opacity<1)||samples.values[2].opacity<.99)throw Error(`${kind}: entrance not gradual ${JSON.stringify(samples)}`);
if(reducedMotion==='no-preference' && kind!=='seven')await page.screenshot({path:resolve(root,`artifacts/cue-${kind}-entrance.png`)});
// Restore the animation and verify that repeated snapshots retain the same DOM timeline.
await panel.evaluate(el=>{el.dataset.timeline='original';el.getAnimations()[0].play();});
match=structuredClone(match);await page.evaluate(()=>window.__notify());await page.waitForTimeout(100);
await expect(panel).toHaveAttribute('data-timeline','original');
if(kind==='seven') {
await page.waitForTimeout(1650);await expect(panel).toBeAttached(); // Server deadline already passed.
await page.waitForTimeout(1100);await expect(panel).toHaveCount(0);
await page.evaluate(()=>window.__notify());await page.waitForTimeout(100);await expect(panel).toHaveCount(0);
match.handballCue={...cue,id:'expired-cue',at:Date.now()-10000};await page.evaluate(()=>window.__notify());await page.waitForTimeout(150);await expect(panel).toHaveCount(0);
}
reports.push({kind,reducedMotion,...samples});console.log(kind+' '+reducedMotion+' PASS');await page.close();
}
writeFileSync(resolve(root,'artifacts/cue-animation-verification.json'),JSON.stringify(reports,null,2));
}finally{await browser.close();server.closeAllConnections();server.close();}

