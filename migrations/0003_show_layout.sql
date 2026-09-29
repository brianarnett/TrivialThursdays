-- 0003: Show Layout — shows made of time slots, content pipeline, roles, email log.
-- Moves the existing episodes/segments into the new model; old tables are kept as _legacy_* for safety.

CREATE TABLE users (
  email       TEXT PRIMARY KEY,                -- lower-case; identity comes from Cloudflare Access
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL CHECK (role IN ('owner','producer','viewer')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE shows (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  air_date            TEXT NOT NULL UNIQUE,     -- YYYY-MM-DD, America/New_York
  season              TEXT NOT NULL DEFAULT '',
  title               TEXT NOT NULL DEFAULT '', -- headline for special shows
  notes               TEXT NOT NULL DEFAULT '', -- internal planning notes
  after_notes         TEXT NOT NULL DEFAULT '', -- after-show notes
  recording_url       TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','ready','aired')),
  published           INTEGER NOT NULL DEFAULT 1,
  schedule_sent_at    TEXT,
  schedule_sent_by    TEXT NOT NULL DEFAULT '',
  changed_since_sent  INTEGER NOT NULL DEFAULT 0,
  sent_snapshot       TEXT NOT NULL DEFAULT '', -- JSON of slots as last emailed, used to find who a change affects
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE slot_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  position      INTEGER NOT NULL,
  duration_min  INTEGER NOT NULL,
  slot_type     TEXT NOT NULL CHECK (slot_type IN ('program','guest','music','announcement','feature','break')),
  label         TEXT NOT NULL
);

CREATE TABLE content_items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  kind               TEXT NOT NULL CHECK (kind IN ('guest','music','announcement','feature')),
  title              TEXT NOT NULL,             -- working title / topic
  public_name        TEXT NOT NULL DEFAULT '',  -- how it reads on the public schedule
  public_note        TEXT NOT NULL DEFAULT '',  -- small public aside, e.g. "Voter Reg. Deadline"
  description        TEXT NOT NULL DEFAULT '',
  link               TEXT NOT NULL DEFAULT '',
  organization       TEXT NOT NULL DEFAULT '',
  event_date         TEXT NOT NULL DEFAULT '',
  date_preferences   TEXT NOT NULL DEFAULT '',
  appearance         TEXT NOT NULL DEFAULT '' CHECK (appearance IN ('','studio','phone','remote')),
  performers         TEXT NOT NULL DEFAULT '',
  setup_needs        TEXT NOT NULL DEFAULT '',
  contact_name       TEXT NOT NULL DEFAULT '',
  contact_email      TEXT NOT NULL DEFAULT '',
  contact_phone      TEXT NOT NULL DEFAULT '',
  consent            INTEGER NOT NULL DEFAULT 0,
  stage              TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','reviewing','approved','scheduled','aired','declined','hold','withdrawn')),
  source             TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('form','admin','legacy')),
  internal_notes     TEXT NOT NULL DEFAULT '',
  submitter_ip_hash  TEXT NOT NULL DEFAULT '',
  contact_purged_at  TEXT,
  legacy_segment_id  INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_content_stage ON content_items(stage, created_at);
CREATE INDEX idx_content_email ON content_items(contact_email);
CREATE INDEX idx_content_ip ON content_items(submitter_ip_hash, created_at);

CREATE TABLE slots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  show_id       INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  start_min     INTEGER NOT NULL,              -- minutes after midnight, e.g. 600 = 10:00
  duration_min  INTEGER NOT NULL,
  slot_type     TEXT NOT NULL CHECK (slot_type IN ('program','guest','music','announcement','feature','break')),
  label         TEXT NOT NULL DEFAULT '',
  content_id    INTEGER REFERENCES content_items(id) ON DELETE SET NULL,
  confirmed     INTEGER NOT NULL DEFAULT 0,
  public        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT NOT NULL DEFAULT ''       -- prep notes, internal
);
CREATE INDEX idx_slots_show ON slots(show_id, position);
CREATE INDEX idx_slots_content ON slots(content_id);

CREATE TABLE content_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id  INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  from_stage  TEXT NOT NULL DEFAULT '',
  to_stage    TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  actor       TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_history_content ON content_history(content_id, at);

CREATE TABLE email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                   -- submission_ack, submission_alert, schedule_guest, schedule_owner, schedule_update, schedule_removed
  to_addr     TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,
  show_id     INTEGER,
  content_id  INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('sent','logged','failed')),  -- logged = sending not enabled yet
  error       TEXT NOT NULL DEFAULT '',
  actor       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_show ON email_log(show_id);
CREATE INDEX idx_email_content ON email_log(content_id);

CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL DEFAULT '',
  target_id    INTEGER,
  detail       TEXT NOT NULL DEFAULT '',
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default layout (R9)
INSERT INTO slot_templates (position, duration_min, slot_type, label) VALUES
  (0, 5,  'program', 'Open / intro'),
  (1, 25, 'guest',   'Guest segment 1'),
  (2, 25, 'guest',   'Guest segment 2'),
  (3, 5,  'break',   'Station ID / break'),
  (4, 25, 'guest',   'Guest segment 3'),
  (5, 25, 'music',   'Musical guest'),
  (6, 10, 'program', 'Community calendar / close');

-- New settings (blank = not configured yet)
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('alert_email', ''), ('from_email', 'show@trivialthursdays.com'), ('from_name', 'Trivial Thursdays on WRFL'),
  ('email_admins_enabled', '0'), ('email_guests_enabled', '0'), ('arrive_before_min', ''), ('station_address', ''), ('dayof_contact', ''),
  ('retention_months', '12'), ('site_url', 'https://www.trivialthursdays.com'), ('show_start', '10:00');

-- ---------- move existing data ----------
INSERT INTO shows (id, air_date, season, title, notes, published, status)
SELECT id, air_date, season, title, notes, published,
       CASE WHEN air_date < date('now', '-5 hours') THEN 'aired' ELSE 'planning' END
FROM episodes;

INSERT INTO content_items (kind, title, public_name, public_note, link, stage, source, legacy_segment_id, consent)
SELECT CASE s.kind WHEN 'music' THEN 'music' WHEN 'feature' THEN 'feature' ELSE 'guest' END,
       s.name, s.name, s.note, s.url,
       CASE WHEN e.air_date < date('now', '-5 hours') THEN 'aired' ELSE 'scheduled' END,
       'legacy', s.id, 1
FROM segments s JOIN episodes e ON e.id = s.episode_id;

INSERT INTO content_history (content_id, to_stage, note, actor)
SELECT id, stage, 'Imported from the Fall 2026 schedule', 'system' FROM content_items WHERE source = 'legacy';

-- Every show gets the default layout, with running start times.
INSERT INTO slots (show_id, position, start_min, duration_min, slot_type, label, public)
SELECT sh.id, t.position,
       600 + COALESCE((SELECT SUM(t2.duration_min) FROM slot_templates t2 WHERE t2.position < t.position), 0),
       t.duration_min, t.slot_type, t.label, 1
FROM shows sh CROSS JOIN slot_templates t;

-- Place old segments: music → Musical guest slot; guests in order → Guest 1, 2, 3, then the music slot if unused.
CREATE TABLE _mig (seg_id INTEGER, seg_pos INTEGER, show_id INTEGER, content_id INTEGER, kind TEXT, target INTEGER);
INSERT INTO _mig (seg_id, seg_pos, show_id, content_id, kind)
SELECT s.id, s.position, s.episode_id, c.id, c.kind FROM segments s JOIN content_items c ON c.legacy_segment_id = s.id;

UPDATE _mig SET target = CASE
  WHEN kind = 'music' THEN
    CASE WHEN (SELECT COUNT(*) FROM _mig m WHERE m.show_id = _mig.show_id AND m.kind = 'music' AND m.seg_pos < _mig.seg_pos) = 0 THEN 5 ELSE 100 END
  ELSE
    CASE (SELECT COUNT(*) FROM _mig m WHERE m.show_id = _mig.show_id AND m.kind <> 'music' AND m.seg_pos < _mig.seg_pos)
      WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 4
      WHEN 3 THEN CASE WHEN EXISTS (SELECT 1 FROM _mig m WHERE m.show_id = _mig.show_id AND m.kind = 'music') THEN 100 ELSE 5 END
      ELSE 100 END
END;

UPDATE slots SET
  content_id = (SELECT m.content_id FROM _mig m WHERE m.show_id = slots.show_id AND m.target = slots.position),
  slot_type  = (SELECT m.kind FROM _mig m WHERE m.show_id = slots.show_id AND m.target = slots.position),
  confirmed  = 1
WHERE EXISTS (SELECT 1 FROM _mig m WHERE m.show_id = slots.show_id AND m.target = slots.position);

UPDATE slots SET label = 'Guest segment 4' WHERE position = 5 AND slot_type = 'guest';

-- Anything that didn't fit goes after the close with 0 minutes, so the layout warning flags it for review.
INSERT INTO slots (show_id, position, start_min, duration_min, slot_type, label, content_id, confirmed, public)
SELECT show_id, 100 + seg_pos, 720, 0, kind, 'Additional segment', content_id, 1, 1 FROM _mig WHERE target = 100;

DROP TABLE _mig;

ALTER TABLE segments RENAME TO _legacy_segments;
ALTER TABLE episodes RENAME TO _legacy_episodes;
