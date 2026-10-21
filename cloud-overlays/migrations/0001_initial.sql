CREATE TABLE entities (
  kind TEXT NOT NULL CHECK(kind IN ('match','tournament','user')),
  id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  tournament_id TEXT GENERATED ALWAYS AS (json_extract(payload,'$.tournamentId')) VIRTUAL,
  username TEXT GENERATED ALWAYS AS (CASE WHEN kind='user' THEN lower(json_extract(payload,'$.username')) END) VIRTUAL,
  PRIMARY KEY(kind,id)
);
CREATE INDEX entities_tournament ON entities(kind,tournament_id);
CREATE UNIQUE INDEX entities_username ON entities(username) WHERE username IS NOT NULL;
CREATE TABLE history(seq INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX history_match ON history(match_id,seq DESC);
CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
-- A failed optimistic check aborts the entire D1 batch, including history.
CREATE TABLE generation(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CONSTRAINT concurrent_write CHECK(version>=0));
INSERT INTO generation VALUES(1,0);
CREATE TABLE login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
CREATE INDEX login_attempts_expiry ON login_attempts(until);
