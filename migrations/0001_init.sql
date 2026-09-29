-- Trivial Thursdays on WRFL — core schema
-- Episodes are one row per Thursday broadcast; segments are the guests / musical guests on that show.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS episodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  air_date    TEXT NOT NULL UNIQUE,          -- YYYY-MM-DD (local, America/New_York)
  season      TEXT NOT NULL DEFAULT '',      -- e.g. "Fall 2026"
  title       TEXT NOT NULL DEFAULT '',      -- optional headline for special shows
  notes       TEXT NOT NULL DEFAULT '',      -- optional free text shown under the lineup
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS segments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest','music','feature')),
  name        TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT ''       -- small italic aside, e.g. "Voter Reg. Deadline"
);

CREATE INDEX IF NOT EXISTS idx_segments_episode ON segments(episode_id, position);
CREATE INDEX IF NOT EXISTS idx_episodes_date ON episodes(air_date);
