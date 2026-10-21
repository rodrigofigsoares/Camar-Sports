import {DatabaseSync} from 'node:sqlite';
import {SqliteRepository} from '../server/repository.ts';
const db=new DatabaseSync('data/camar.sqlite',{readOnly:true});
const rows=db.prepare('SELECT kind,payload FROM entities WHERE kind IN (?,?)').all('tournament','match');db.close();
const qa=new SqliteRepository('artifacts/qa.sqlite');
for(const row of rows)qa.put(row.kind,JSON.parse(row.payload));
qa.db.close();
