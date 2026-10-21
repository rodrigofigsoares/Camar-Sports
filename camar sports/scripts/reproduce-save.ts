import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {createApi} from '../server/api.ts';
import {SqliteRepository} from '../server/repository.ts';
const db=new DatabaseSync('data/camar.sqlite',{readOnly:true});
const rows=db.prepare('SELECT kind,payload FROM entities WHERE kind IN (?,?)').all('tournament','match');db.close();
for(const rules of [['headToHead','headDifference','headScored','difference','scored'],['headToHead','difference','scored'],['wins','difference','scored']]) {
 const repo=new SqliteRepository(':memory:');
 for(const row of rows)repo.put(row.kind,JSON.parse(row.payload));
 const app=createApi(repo),server=createServer((q,s)=>void app.handle(q,s));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const setup=await fetch(base+'setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'diagnostic',password:'temporary-diagnostic',name:'Diagnostic'})});
 const cookie=setup.headers.get('set-cookie').split(';')[0];
 const t=JSON.parse(rows.find(r=>r.kind==='tournament').payload);t.scoring.tiebreakers=rules;
 const res=await fetch(base+'tournaments/'+t.id,{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({tournament:t})});
 const data=await res.json();console.log({rules,status:res.status,error:data.error});
 app.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
