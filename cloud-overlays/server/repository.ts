import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import type { Match, Tournament, User } from "../../shared/domain/model.ts";

export type Entity = Match | Tournament | (User & { passwordHash: string });
export type Kind = "match" | "tournament" | "user";
// Replace this boundary with Supabase tables/RPC and realtime when moving online.
export interface Repository {
  list<T>(kind: Kind): T[];
  get<T>(kind: Kind, id: string): T | undefined;
  put<T extends { id: string }>(kind: Kind, value: T): void;
  remove(kind: Kind, id: string): void;
  transaction<T>(fn: () => T): T;
}
export class SqliteRepository implements Repository {
  db: DatabaseSync;
  constructor(path = process.env.CAMAR_DB ?? resolvePath("data/camar.sqlite")) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS history(seq INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
      PRAGMA user_version=1;`);
  }
  list<T>(kind: Kind): T[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM entities WHERE kind=? ORDER BY rowid DESC",
        )
        .all(kind) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  get<T>(kind: Kind, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT payload FROM entities WHERE kind=? AND id=?")
      .get(kind, id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  }
  put<T extends { id: string }>(kind: Kind, value: T) {
    this.db
      .prepare(
        "INSERT INTO entities(kind,id,payload) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload",
      )
      .run(kind, value.id, JSON.stringify(value));
  }
  remove(kind: Kind, id: string) {
    this.db.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  pushHistory(m: Match) {
    this.db
      .prepare("INSERT INTO history(match_id,payload) VALUES(?,?)")
      .run(m.id, JSON.stringify(m));
    this.db
      .prepare(
        "DELETE FROM history WHERE match_id=? AND seq NOT IN (SELECT seq FROM history WHERE match_id=? ORDER BY seq DESC LIMIT 100)",
      )
      .run(m.id, m.id);
  }
  popHistory(matchId: string): Match | undefined {
    const row = this.db
      .prepare(
        "SELECT seq,payload FROM history WHERE match_id=? ORDER BY seq DESC LIMIT 1",
      )
      .get(matchId) as { seq: number; payload: string } | undefined;
    if (!row) return;
    this.db.prepare("DELETE FROM history WHERE seq=?").run(row.seq);
    return JSON.parse(row.payload);
  }
  clearHistory(matchId: string) {
    this.db.prepare("DELETE FROM history WHERE match_id=?").run(matchId);
  }
}
