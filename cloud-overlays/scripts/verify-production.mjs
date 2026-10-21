import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base='https://cloud-overlays.camarlabsports.workers.dev';
const backup=JSON.parse(readFileSync('artifacts/offline-backup.json','utf8'));
const manifest=JSON.parse(readFileSync('artifacts/migration-manifest.json','utf8'));
const homepage=await fetch(base);assert.equal(homepage.status,200);
const session=await fetch(base+'/api/session');assert.equal(session.status,200);
const installation=await session.json();
assert.equal((await fetch(base+'/api/matches')).status,401);
let count=0;
for(const t of backup.tournaments) {
  const res=await fetch(base+'/api/tournaments/'+t.id+'/state');assert.equal(res.status,200);
  const state=await res.json();assert.equal(state.tournament.id,t.id);
  assert.deepEqual(state.matches.map(m=>m.id).sort(),backup.matches.filter(m=>m.tournamentId===t.id).map(m=>m.id).sort());
  assert.ok(state.matches.every(m=>m.clock.startedAt===null));count+=state.matches.length;
  const unchanged=await fetch(base+'/api/tournaments/'+t.id+'/state',{headers:{'If-None-Match':res.headers.get('ETag')}});assert.equal(unchanged.status,304);
}
for(const m of backup.matches.filter(m=>!m.tournamentId)) {
  const res=await fetch(base+'/api/matches/'+m.id);assert.equal(res.status,200);assert.equal((await res.json()).id,m.id);count++;
}
const unchanged=createHash('sha256').update(readFileSync('../camar sports/data/camar.sqlite')).digest('hex')===manifest.sourceSha256;
assert.ok(unchanged,'O banco offline mudou desde o snapshot; verificar se a operação local continuou.');
const report={url:base,verifiedAt:new Date().toISOString(),tournaments:backup.tournaments.length,matches:count,setupRequired:installation.setup,offlineDatabaseUnchanged:unchanged,conditionalRequests:304};
writeFileSync('artifacts/production-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
