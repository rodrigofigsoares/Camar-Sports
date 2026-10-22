import type { Match } from '../../shared/domain/model';
import { HttpError } from './types';

type Kind = 'match' | 'tournament' | 'user';
type Row = { kind: Kind; id: string; payload: string };

/** Request-local unit of work. Domain rules remain synchronous; only the final
 * batch writes D1. A database generation guard makes stale snapshots roll back. */
export class D1Repository {
  private records = new Map<string, Row>();
  private writes = new Map<string, Row>();
  private removals = new Map<string, {kind: Kind; id: string}>();
  private historyAdds: {match_id: string; payload: string}[] = [];
  private historyDeletes: number[] = [];
  private historyClears = new Set<string>();
  private history: {seq: number; payload: string}[] = [];
  private version = 0;
  private initialKeys = new Set<string>();
  readonly changedRooms = new Set<string>();
  private trackRoom(kind: Kind, value: {id:string; tournamentId?:string}) {
    if (kind==='tournament') this.changedRooms.add('tournament:'+value.id);
    if (kind==='match') this.changedRooms.add(value.tournamentId?'tournament:'+value.tournamentId:'match:'+value.id);
  }
  constructor(private db: D1Database) {}
  get generation() { return this.version; }
  static async load(db: D1Database, resource: string, entityId?: string, narrowMatch = false) {
    const repo = new D1Repository(db);
    // Match commands read only their competition. Backups intentionally read all.
    let sql = 'SELECT kind,id,payload FROM entities';
    let args: string[] = [];
    if (resource === 'matches' && entityId) {
      sql += ` WHERE (kind='match' AND id=?) OR
        (kind='tournament' AND id=(SELECT tournament_id FROM entities WHERE kind='match' AND id=?))`;
      args = [entityId, entityId];
      if (!narrowMatch) {
        sql += " OR (kind='match' AND tournament_id=(SELECT tournament_id FROM entities WHERE kind='match' AND id=?))";
        args.push(entityId);
      }
    } else if (resource === 'tournaments' && entityId) {
      sql += " WHERE (kind='tournament' AND id=?) OR (kind='match' AND tournament_id=?)";
      args = [entityId, entityId];
    } else if (resource === 'users' || resource === 'setup') {
      sql += " WHERE kind='user'";
    } else if (resource !== 'backup') {
      sql += ' WHERE 0';
    }
    const results = await db.batch([
      db.prepare('SELECT version FROM generation WHERE id=1'),
      db.prepare(sql).bind(...args),
      db.prepare('SELECT seq,payload FROM history WHERE match_id=? ORDER BY seq DESC LIMIT 1').bind(entityId ?? ''),
    ]);
    repo.version = (results[0].results[0] as {version: number}).version;
    for (const row of results[1].results as Row[]) {
      const key = row.kind + ':' + row.id;
      repo.records.set(key, row); repo.initialKeys.add(key);
    }
    repo.history = results[2].results as {seq: number; payload: string}[];
    return repo;
  }
  async expandCompetition(tournamentId: string) {
    const results = await this.db.batch([
      this.db.prepare('SELECT version FROM generation WHERE id=1'),
      this.db.prepare("SELECT kind,id,payload FROM entities WHERE kind='match' AND tournament_id=?").bind(tournamentId),
    ]);
    if ((results[0].results[0] as {version:number}).version !== this.version)
      throw new HttpError(409, 'Outra janela alterou os dados. Recarregue e tente novamente.');
    for (const row of results[1].results as Row[]) {
      const key = row.kind + ':' + row.id;
      if (!this.records.has(key)) { this.records.set(key,row); this.initialKeys.add(key); }
    }
  }
  list<T>(kind: Kind): T[] {
    return [...this.records.values()].filter(r => r.kind === kind).map(r => JSON.parse(r.payload));
  }
  get<T>(kind: Kind, id: string): T | undefined {
    const row = this.records.get(kind + ':' + id);
    return row ? JSON.parse(row.payload) : undefined;
  }
  put<T extends {id: string}>(kind: Kind, value: T) {
    this.trackRoom(kind,value);
    const key = kind + ':' + value.id;
    const row = {kind, id: value.id, payload: JSON.stringify(value)};
    this.records.set(key, row); this.writes.set(key, row); this.removals.delete(key);
  }
  remove(kind: Kind, id: string) {
    const key = kind + ':' + id;
    const old=this.records.get(key);
    if(old) this.trackRoom(kind,JSON.parse(old.payload));
    this.records.delete(key); this.writes.delete(key); this.removals.set(key, {kind,id});
  }
  transaction<T>(fn: () => T): T { return fn(); }
  pushHistory(m: Match) { this.historyAdds.push({match_id: m.id, payload: JSON.stringify(m)}); }
  popHistory(_matchId: string): Match | undefined {
    const row = this.history.shift();
    if (!row) return;
    this.historyDeletes.push(row.seq); return JSON.parse(row.payload);
  }
  clearHistory(matchId: string) {
    this.historyClears.add(matchId);
    this.historyAdds = this.historyAdds.filter(h => h.match_id !== matchId);
  }
  async commit(extra: D1PreparedStatement[] = []) {
    if (!this.writes.size && !this.removals.size && !this.historyAdds.length && !this.historyDeletes.length && !this.historyClears.size && !extra.length) return;
    const encode = (data: unknown) => {
      const value = JSON.stringify(data);
      if (new TextEncoder().encode(value).length > 1_500_000)
        throw new HttpError(413, 'Operação grande demais. Divida a importação em campeonatos menores.');
      return value;
    };
    const statements = [this.db.prepare('UPDATE generation SET version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=1').bind(this.version)];
    if (this.removals.size) statements.push(this.db.prepare(`DELETE FROM entities WHERE (kind,id) IN
      (SELECT json_extract(value,'$.kind'),json_extract(value,'$.id') FROM json_each(?))`).bind(encode([...this.removals.values()])));
    const removedUsers = [...this.removals.values()].filter(row => row.kind === 'user').map(row => row.id);
    if (removedUsers.length) statements.push(this.db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT value FROM json_each(?))').bind(encode(removedUsers)));
    const inserts = [...this.writes.entries()].filter(([key]) => !this.initialKeys.has(key)).map(([,row]) => row);
    const updates = [...this.writes.entries()].filter(([key]) => this.initialKeys.has(key)).map(([,row]) => row);
    if (inserts.length) statements.push(this.db.prepare(`INSERT INTO entities(kind,id,payload)
      SELECT json_extract(value,'$.kind'),json_extract(value,'$.id'),json_extract(value,'$.payload') FROM json_each(?)`).bind(encode(inserts)));
    if (updates.length) statements.push(this.db.prepare(`INSERT INTO entities(kind,id,payload)
      SELECT json_extract(value,'$.kind'),json_extract(value,'$.id'),json_extract(value,'$.payload') FROM json_each(?) WHERE 1
      ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload`).bind(encode(updates)));
    if (this.historyClears.size) statements.push(this.db.prepare('DELETE FROM history WHERE match_id IN (SELECT value FROM json_each(?))').bind(encode([...this.historyClears])));
    if (this.historyDeletes.length) statements.push(this.db.prepare('DELETE FROM history WHERE seq IN (SELECT value FROM json_each(?))').bind(encode(this.historyDeletes)));
    if (this.historyAdds.length) {
      statements.push(this.db.prepare(`INSERT INTO history(match_id,payload)
        SELECT json_extract(value,'$.match_id'),json_extract(value,'$.payload') FROM json_each(?)`).bind(encode(this.historyAdds)));
      statements.push(this.db.prepare(`DELETE FROM history WHERE seq IN (
        SELECT seq FROM (SELECT seq,ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY seq DESC) AS n
        FROM history WHERE match_id IN (SELECT value FROM json_each(?))) WHERE n>100)`)
        .bind(encode([...new Set(this.historyAdds.map(h => h.match_id))])));
    }
    try { await this.db.batch([...statements, ...extra]); this.version++; }
    catch (error) {
      if (String(error).includes('concurrent_write')) throw new HttpError(409, 'Outra janela alterou os dados. Recarregue e tente novamente.');
      if (String(error).includes('UNIQUE constraint')) throw new HttpError(409, 'Registro ou nome de usuário já existente.');
      throw error;
    }
  }
}
