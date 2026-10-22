import {DatabaseSync} from 'node:sqlite';
import {tournamentSchema} from '../../shared/domain/model.ts';
import {validateTournament} from '../../shared/domain/tournament.ts';
const db=new DatabaseSync('data/camar.sqlite',{readOnly:true});
const rows=db.prepare('SELECT kind,payload FROM entities WHERE kind IN (?,?)').all('tournament','match');
const ms=rows.filter(r=>r.kind==='match').map(r=>JSON.parse(r.payload));
for(const row of rows.filter(r=>r.kind==='tournament')){
 const t=JSON.parse(row.payload); const valid=tournamentSchema.safeParse(t);
 console.log({id:t.id,name:t.name,revision:t.revision, schema:valid.success ? 'ok': valid.error.issues});
 try {validateTournament(t,ms.filter(m=>m.tournamentId===t.id));console.log('structure ok');}catch(e){console.log('structure:',e.message);}
}
db.close();
