import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, existsSync } from 'node:fs';
import { D1Repository } from './repository';
import { createMatch, createTournament, team, type Match } from '../src/domain/model';
import { generate } from '../src/domain/tournament';
import { clockValue } from '../src/domain/scoring';

describe('Cloudflare worker with real local D1 runtime', () => {
  let mf: Miniflare, db: D1Database, cookie = '';
  async function request(path: string, method='GET', value?: unknown, authenticated=true) {
    const res=await mf.dispatchFetch('https://test.local/api/'+path, {
      method, headers: {'Content-Type':'application/json', ...(authenticated && cookie ? {Cookie:cookie}: {})},
      body:value===undefined?undefined:JSON.stringify(value),
    });
    return {status:res.status,data:await res.json() as any,cookie:res.headers.get('set-cookie')};
  }
  beforeAll(async () => {
    mf = new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.wrangler/build/index.js',compatibilityDate:'2026-09-23',d1Databases:['DB'],durableObjects:{LIVE_ROOMS:{className:'LiveRoom',useSQLite:true}},bindings:{SETUP_TOKEN:'test-install-secret'}}));
    db = await mf.getD1Database('DB') as unknown as D1Database;
    const sql=readFileSync('migrations/0001_initial.sql','utf8').replace(/--[^\n]*/g,'');
    for (const statement of sql.split(';').filter(s=>s.trim())) await db.prepare(statement).run();
  },30000);
  afterAll(async () => {await mf?.dispose();});
  async function connect(path:string) {
    const response=await mf.dispatchFetch('https://test.local/api/live?resource='+encodeURIComponent(path),{headers:{Upgrade:'websocket'}});
    expect(response.status).toBe(101);
    const socket=response.webSocket!;socket.accept();return socket;
  }
  it('protects first admin setup, sessions and public listings',async () => {
    expect((await request('setup','POST',{username:'admin',password:'test-password'})).status).toBe(403);
    const setup=await request('setup','POST',{username:'admin',password:'test-password',setupToken:'test-install-secret'});
    expect(setup.status).toBe(200); expect(setup.cookie).toContain('Secure');
    cookie=setup.cookie!.split(';')[0];
    expect((await request('setup','POST',{username:'admin2',password:'test-password',setupToken:'test-install-secret'})).status).toBe(409);
    expect((await request('session')).data.user.role).toBe('admin');
    expect((await request('matches','GET',undefined,false)).status).toBe(401);
    expect((await request('login','POST',{username:'admin',password:'wrong-password'})).status).toBe(401);
    expect((await request('login','POST',{username:'admin',password:'test-password'})).status).toBe(200);
  });
  it('persists scoring, prevents stale commands and supports undo',async () => {
    const created=await request('matches','POST',{sport:'handball'});
    expect(created.status).toBe(201);
    const m=created.data;
    const score=await request('matches/'+m.id,'POST',{revision:0,command:{type:'score',side:'a',amount:1}});
    expect(score.status).toBe(200); expect(score.data.a.score).toBe(1);
    expect((await request('matches/'+m.id,'POST',{revision:0,command:{type:'score',side:'a',amount:1}})).status).toBe(409);
    const undo=await request('matches/'+m.id+'/undo','POST',{revision:1});
    expect(undo.status).toBe(200); expect(undo.data.a.score).toBe(0);
    expect((await request('matches/'+m.id,'GET',undefined,false)).status).toBe(200);
    expect((await request('matches/'+m.id,'PATCH',{})).status).toBe(405);
  });
  it('rolls back the entire D1 batch if another request commits first',async () => {
    const m=createMatch('handball');
    const first=await D1Repository.load(db,'matches'); first.put('match',m); await first.commit();
    const a=await D1Repository.load(db,'matches',m.id), b=await D1Repository.load(db,'matches',m.id);
    const changed={...m,revision:1}; a.put('match',changed); a.pushHistory(m); await a.commit();
    b.remove('match',m.id); b.clearHistory(m.id);
    await expect(b.commit()).rejects.toMatchObject({status:409});
    expect((await db.prepare("SELECT payload FROM entities WHERE kind='match' AND id=?").bind(m.id).first())).toBeTruthy();
    expect((await db.prepare('SELECT count(*) n FROM history WHERE match_id=?').bind(m.id).first<{n:number}>())?.n).toBe(1);
  });
  it('never overwrites an existing ID outside the loaded tournament',async () => {
    const existing=createMatch('handball');
    const a=await D1Repository.load(db,'matches'); a.put('match',existing); await a.commit();
    const b=await D1Repository.load(db,'tournaments',crypto.randomUUID());
    b.put('match',{...existing,revision:99});
    await expect(b.commit()).rejects.toMatchObject({status:409});
    expect((await request('matches/'+existing.id)).data.revision).toBe(0);
  });
  it('validates backups before committing and resolves expired clocks once',async () => {
    expect((await request('backup','POST',{version:2,matches:[{id:'invalid'}],tournaments:[]})).status).toBe(400);
    const m=createMatch('handball'); m.period='2º tempo';m.status='live';m.a.score=12;
    m.clock={direction:'up',value:1799,limit:1800,startedAt:Date.now()-2000};m.playStartedAt=m.clock.startedAt;
    const repo=await D1Repository.load(db,'matches');repo.put('match',m);await repo.commit();
    const ended=(await request('matches/'+m.id)).data as Match;
    expect(ended.status).toBe('done');expect(ended.revision).toBe(1);
    expect((await request('matches/'+m.id)).data.revision).toBe(1);
    const backup=await request('backup');expect(backup.data.version).toBe(2);
  });
  it.runIf(existsSync('artifacts/offline-backup.json'))('imports the real migration snapshot without losing any entity', async () => {
    const backup=JSON.parse(readFileSync('artifacts/offline-backup.json','utf8'));
    const response=await request('backup','POST',backup);
    expect(response.status).toBe(200);
    for(const t of backup.tournaments) {
      expect((await request('tournaments/'+t.id)).data.id).toBe(t.id);
      const rows=(await request('matches?tournament='+t.id)).data;
      expect(rows.length).toBe(backup.matches.filter((m:Match)=>m.tournamentId===t.id).length);
    }
    expect((await request('backup','POST',backup)).status).toBe(409);
  });
  it('enforces viewer permissions and rejects cross-origin writes',async () => {
    const created=await request('users','POST',{user:{id:crypto.randomUUID(),username:'viewer',name:'Viewer',role:'viewer',sports:[],disabled:false},password:'viewer-password'});
    expect(created.status).toBe(200);
    const login=await request('login','POST',{username:'viewer',password:'viewer-password'});
    const adminCookie=cookie;cookie=login.cookie!.split(';')[0];
    expect((await request('matches','POST',{sport:'handball'})).status).toBe(403);
    expect((await request('backup')).status).toBe(403);
    cookie=adminCookie;
    const res=await mf.dispatchFetch('https://test.local/api/matches',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.invalid'},body:JSON.stringify({sport:'handball'})});
    expect(res.status).toBe(403);
  });
  it('allows only admins to delete other users and revokes all their sessions', async () => {
    const adminCookie = cookie;
    const admin = (await request('session')).data.user;
    expect((await request('users/'+admin.id,'DELETE')).status).toBe(400);
    expect((await request('users','DELETE')).status).toBe(400);
    expect((await request('users/'+crypto.randomUUID(),'DELETE')).status).toBe(404);
    const before = (await request('backup')).data;
    for (const role of ['operator', 'viewer', 'admin']) {
      const user = {id:crypto.randomUUID(),username:'delete-'+role,name:'Delete '+role,role,sports:[],disabled:false};
      expect((await request('users','POST',{user,password:'delete-password'})).status).toBe(200);
      const login = await request('login','POST',{username:user.username,password:'delete-password'});
      const secondLogin = await request('login','POST',{username:user.username,password:'delete-password'});
      expect(login.status).toBe(200);
      expect(secondLogin.status).toBe(200);
      expect((await request('users/'+user.id,'DELETE',undefined,false)).status).toBe(401);
      const crossOrigin = await mf.dispatchFetch('https://test.local/api/users/'+user.id,{
        method:'DELETE',headers:{Cookie:adminCookie,Origin:'https://evil.invalid'},
      });
      expect(crossOrigin.status).toBe(403);
      try {
        cookie = login.cookie!.split(';')[0];
        if (role !== 'admin') expect((await request('users/'+admin.id,'DELETE')).status).toBe(403);
      } finally { cookie = adminCookie; }
      expect((await request('users/'+user.id,'DELETE')).status).toBe(200);
      expect((await request('users')).data.some((u: {id:string}) => u.id === user.id)).toBe(false);
      expect((await db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').bind(user.id).first<{n:number}>())?.n).toBe(0);
      try {
        for (const session of [login,secondLogin]) {
          cookie = session.cookie!.split(';')[0];
          expect((await request('session')).data.user).toBeNull();
          expect((await request('matches')).status).toBe(401);
        }
      } finally { cookie = adminCookie; }
      expect((await request('login','POST',{username:user.username,password:'delete-password'})).status).toBe(401);
      expect((await request('users/'+user.id,'DELETE')).status).toBe(404);
    }
    const after = (await request('backup')).data;
    expect(after.matches).toEqual(before.matches);
    expect(after.tournaments).toEqual(before.tournaments);
    expect((await request('session')).data.user.id).toBe(admin.id);
  });
  it('saves a tournament, advances its winners and invalidates conditional reads',async () => {
    const created=await request('tournaments','POST',{sport:'handball',name:'D1 bracket'});
    const tournament=created.data;
    tournament.teams=Array.from({length:4},(_,i)=>team('Team '+i,i));
    const generated=generate(tournament,'single',tournament.teams,'Principal');
    const saved=await request('tournaments/'+tournament.id,'PUT',{tournament:generated.tournament,matches:generated.matches});
    expect(saved.status).toBe(200);
    const state=await mf.dispatchFetch('https://test.local/api/tournaments/'+tournament.id+'/state');
    expect(state.status).toBe(200);
    const etag=state.headers.get('ETag')!;
    const unchanged=await mf.dispatchFetch('https://test.local/api/tournaments/'+tournament.id+'/state',{headers:{'If-None-Match':etag}});
    expect(unchanged.status).toBe(304);
    const compressed=await mf.dispatchFetch('https://test.local/api/tournaments/'+tournament.id+'/state',{headers:{'If-None-Match':'W/'+etag}});
    expect(compressed.status).toBe(304);
    const initial=await state.json() as {matches:Match[]};
    let semi=initial.matches.find(m=>!m.a.team.id.startsWith('pending-'))!;
    const scored=await request('matches/'+semi.id,'POST',{revision:semi.revision,command:{type:'score',side:'a',amount:1}});
    expect(scored.status).toBe(200);expect(scored.data.a.score).toBe(1);semi=scored.data;
    const started=await request('matches/'+semi.id,'POST',{revision:semi.revision,command:{type:'clock',action:'start'}});
    expect(started.status).toBe(200);expect(started.data.clock.startedAt).not.toBeNull();semi=started.data;
    const correction=await request('matches/'+semi.id,'POST',{revision:semi.revision,command:{type:'clock',action:'adjust',seconds:1}});
    expect(correction.status).toBe(200);expect(correction.data.clock.startedAt).not.toBeNull();semi=correction.data;
    const matchSocket=await connect('matches/'+semi.id),tournamentSocket=await connect('tournaments/'+tournament.id+'/state');
    let notifications=0;
    matchSocket.addEventListener('message',()=>notifications++);
    tournamentSocket.addEventListener('message',()=>notifications++);
    const finished=await request('matches/'+semi.id,'POST',{revision:semi.revision,command:{type:'patch',patch:{status:'done',a:{...semi.a,score:3},b:{...semi.b,score:1}}}});
    expect(finished.status).toBe(200);
    await vi.waitFor(()=>expect(notifications).toBe(2));
    matchSocket.close();tournamentSocket.close();
    const changed=await mf.dispatchFetch('https://test.local/api/tournaments/'+tournament.id+'/state',{headers:{'If-None-Match':etag}});
    expect(changed.status).toBe(200);
    const final=(await changed.json() as {matches:Match[]}).matches.find(m=>m.id!==semi.id && (m.a.team.id===semi.a.team.id || m.b.team.id===semi.a.team.id));
    expect(final).toBeTruthy();
  });
  it('notifies two clients only after a committed change and isolates other rooms',async () => {
    const a=(await request('matches','POST',{sport:'handball'})).data;
    const b=(await request('matches','POST',{sport:'handball'})).data;
    const one=await connect('matches/'+a.id),two=await connect('matches/'+a.id),other=await connect('matches/'+b.id);
    const messages:string[]=[];let otherCount=0;
    one.addEventListener('message',e=>messages.push(String(e.data)));
    two.addEventListener('message',e=>messages.push(String(e.data)));
    other.addEventListener('message',()=>otherCount++);
    const start=Date.now();
    const saved=await request('matches/'+a.id,'POST',{revision:0,command:{type:'score',side:'a',amount:1}});
    expect(saved.status).toBe(200);
    await vi.waitFor(()=>expect(messages).toHaveLength(2),{timeout:2000,interval:10});
    console.log('Local commit + notification to both clients (ms):',Date.now()-start);
    expect(messages.every(m=>JSON.parse(m).type==='changed')).toBe(true);
    expect((await request('matches/'+a.id)).data.a.score).toBe(1);
    expect(otherCount).toBe(0);
    const before=messages.length;
    expect((await request('matches/'+a.id,'POST',{revision:0,command:{type:'score',side:'a',amount:1}})).status).toBe(409);
    await new Promise(r=>setTimeout(r,100));expect(messages).toHaveLength(before);
    one.send('ping');await vi.waitFor(()=>expect(messages).toContain('pong'));
    const closed=new Promise<void>(resolve=>one.addEventListener('close',()=>resolve()));
    one.send('{"type":"changed"}');await closed;
    two.close();other.close();
  });
  it('rejects unknown records and cross-origin socket handshakes',async () => {
    expect((await mf.dispatchFetch('https://test.local/api/live?resource=matches/missing',{headers:{Upgrade:'websocket'}})).status).toBe(404);
    expect((await mf.dispatchFetch('https://test.local/api/live?resource=matches/test',{headers:{Upgrade:'websocket',Origin:'https://other.invalid'}})).status).toBe(403);
    expect((await mf.dispatchFetch('https://test.local/api/live')).status).toBe(426);
  });
  it('persists a +1s correction while running and notifies the overlay',async()=>{
    const m=(await request('matches','POST',{sport:'handball'})).data;
    const running=await request('matches/'+m.id,'POST',{revision:0,command:{type:'clock',action:'start'}});
    expect(running.status).toBe(200);
    const socket=await connect('matches/'+m.id);
    let notified=false;socket.addEventListener('message',()=>{notified=true;});
    const adjusted=await request('matches/'+m.id,'POST',{revision:running.data.revision,command:{type:'clock',action:'adjust',seconds:1}});
    expect(adjusted.status).toBe(200);expect(adjusted.data.clock.startedAt).not.toBeNull();
    expect(adjusted.data.clock.value).toBeCloseTo(clockValue(running.data.clock,adjusted.data.clock.startedAt)+1,6);
    await vi.waitFor(()=>expect(notified).toBe(true));
    const read=(await request('matches/'+m.id)).data;
    expect(read.clock).toEqual(adjusted.data.clock);
    expect(read.status).toBe('live');socket.close();
  });
  it('limits live-command reads and rejects expansion across concurrent snapshots',async()=>{
    const t=createTournament('Read budget','handball');
    const matches=Array.from({length:63},()=>({...createMatch('handball'),tournamentId:t.id}));
    const seed=await D1Repository.load(db,'matches');seed.put('tournament',t);
    for(const m of matches) seed.put('match',m);
    await seed.commit();
    let reads=0;
    const measured={prepare:db.prepare.bind(db),batch:async(statements:D1PreparedStatement[])=>{
      const results=await db.batch(statements);
      reads+=results.reduce((n,r)=>n+r.meta.rows_read,0);return results;
    }} as D1Database;
    await D1Repository.load(measured,'matches',matches[0].id);
    const full=reads;reads=0;
    const narrow=await D1Repository.load(measured,'matches',matches[0].id,true);
    console.log('D1 snapshot rows read, 63 matches:',{before:full,after:reads});
    expect(narrow.list('match')).toHaveLength(1);
    expect(reads).toBeLessThan(full/4);
    await narrow.expandCompetition(t.id);expect(narrow.list('match')).toHaveLength(63);
    const stale=await D1Repository.load(db,'matches',matches[0].id,true);
    narrow.put('match',{...matches[0],revision:1});await narrow.commit();
    await expect(stale.expandCompetition(t.id)).rejects.toMatchObject({status:409});
  });
});

