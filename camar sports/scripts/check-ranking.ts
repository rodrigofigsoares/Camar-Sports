import {DatabaseSync} from 'node:sqlite';
import {resolve} from '../src/domain/tournament.ts';
const db=new DatabaseSync('data/camar.sqlite',{readOnly:true});
const rows=db.prepare('SELECT kind,payload FROM entities WHERE kind IN (?,?)').all('tournament','match');db.close();
const matches=rows.filter(r=>r.kind==='match').map(r=>JSON.parse(r.payload));
for(const row of rows.filter(r=>r.kind==='tournament')){
 const t=JSON.parse(row.payload); const rs=resolve(t,matches.filter(m=>m.tournamentId===t.id));
 for(const s of t.stages.filter(s=>s.kind!=='knockout')){
 const table=rs[s.id].standings;
 if(!table.some(r=>/URUA|FARO/i.test(t.teams.find(x=>x.id===r.teamId)?.name??'')))continue;
 console.log(JSON.stringify({stage:s.name,rules:s.tiebreakers??t.scoring.tiebreakers,table:table.map((r,i)=>({position:i+1,name:t.teams.find(x=>x.id===r.teamId)?.name,...r}))}));
 const ids=t.teams.filter(x=>/URUA|FARO/i.test(x.name)).map(x=>x.id);
 console.log(JSON.stringify(matches.filter(m=>s.matchIds.includes(m.id)&&ids.includes(m.a.team.id)&&ids.includes(m.b.team.id)).map(m=>({a:m.a.team.name,b:m.b.team.name,scoreA:m.a.score,scoreB:m.b.score,status:m.status}))));
 }
}
