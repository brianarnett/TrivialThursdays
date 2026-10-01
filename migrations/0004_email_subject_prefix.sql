-- 0004: prefix for every email subject while the project is in testing (clear it in Settings to stop).
INSERT INTO settings (key, value) VALUES ('email_subject_prefix', '[TEST]')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
