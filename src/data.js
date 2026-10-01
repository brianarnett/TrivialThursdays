// Data access for D1. Every mutating function takes `actor` (admin email) for history/audit.
import { parseClock } from './util.js';

/* ---------------- settings & audit ---------------- */

export async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function saveSettings(db, obj) {
  const stmts = Object.entries(obj).map(([k, v]) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v))
  );
  if (stmts.length) await db.batch(stmts);
}

export const audit = (db, actor, action, type = '', id = null, detail = '') =>
  db.prepare('INSERT INTO audit_log (actor, action, target_type, target_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)').bind(actor, action, type, id, String(detail).slice(0, 1000)).run();

/* ---------------- shows & slots ---------------- */

const SLOT_SELECT = `SELECT sl.*, c.kind AS c_kind, c.title AS c_title, c.public_name AS c_public_name, c.public_note AS c_public_note,
  c.link AS c_link, c.contact_name AS c_contact_name, c.contact_email AS c_contact_email, c.contact_phone AS c_contact_phone,
  c.appearance AS c_appearance, c.organization AS c_organization, c.stage AS c_stage, c.description AS c_description,
  c.performers AS c_performers, c.setup_needs AS c_setup_needs
  FROM slots sl LEFT JOIN content_items c ON c.id = sl.content_id`;

function shapeSlot(r) {
  const content = r.content_id
    ? {
        id: r.content_id, kind: r.c_kind, title: r.c_title, public_name: r.c_public_name || r.c_title, public_note: r.c_public_note,
        link: r.c_link, contact_name: r.c_contact_name, contact_email: r.c_contact_email, contact_phone: r.c_contact_phone,
        appearance: r.c_appearance, organization: r.c_organization, stage: r.c_stage, description: r.c_description,
        performers: r.c_performers, setup_needs: r.c_setup_needs,
      }
    : null;
  const { c_kind, c_title, c_public_name, c_public_note, c_link, c_contact_name, c_contact_email, c_contact_phone, c_appearance, c_organization, c_stage, c_description, c_performers, c_setup_needs, ...slot } = r;
  return { ...slot, content };
}

export async function attachSlots(db, shows) {
  if (!shows.length) return shows;
  const ids = shows.map((s) => s.id);
  const { results } = await db.prepare(`${SLOT_SELECT} WHERE sl.show_id IN (${ids.map(() => '?').join(',')}) ORDER BY sl.show_id, sl.position`).bind(...ids).all();
  const by = new Map(shows.map((s) => [s.id, { ...s, slots: [] }]));
  for (const r of results) by.get(r.show_id)?.slots.push(shapeSlot(r));
  return [...by.values()];
}

export async function listShows(db, { from, to, season, status, order = 'ASC', limit = 500, publishedOnly = false } = {}) {
  const w = [], a = [];
  if (from) { a.push(from); w.push(`air_date >= ?${a.length}`); }
  if (to) { a.push(to); w.push(`air_date <= ?${a.length}`); }
  if (season) { a.push(season); w.push(`season = ?${a.length}`); }
  if (status) { a.push(status); w.push(`status = ?${a.length}`); }
  if (publishedOnly) w.push('published = 1');
  a.push(limit);
  const sql = `SELECT * FROM shows ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY air_date ${order === 'DESC' ? 'DESC' : 'ASC'} LIMIT ?${a.length}`;
  const { results } = await db.prepare(sql).bind(...a).all();
  return attachSlots(db, results);
}

export async function listSeasons(db) {
  const { results } = await db.prepare("SELECT season, MIN(air_date) AS first FROM shows WHERE published = 1 AND season <> '' GROUP BY season ORDER BY first DESC").all();
  return results.map((r) => r.season);
}

export async function getShow(db, id) {
  const s = await db.prepare('SELECT * FROM shows WHERE id = ?1').bind(id).first();
  return s ? (await attachSlots(db, [s]))[0] : null;
}

export async function createShow(db, { air_date, season, title = '' }, actor) {
  const row = await db.prepare('INSERT INTO shows (air_date, season, title) VALUES (?1, ?2, ?3) RETURNING id').bind(air_date, season, title).first();
  await applyTemplate(db, row.id);
  await audit(db, actor, 'show.create', 'show', row.id, air_date);
  return row.id;
}

/** Replace a show's slots with the default layout. Content in removed slots goes back to Approved. */
export async function applyTemplate(db, showId, actor = null) {
  const settings = await getSettings(db);
  const start = parseClock(settings.show_start);
  const { results: tpl } = await db.prepare('SELECT * FROM slot_templates ORDER BY position').all();
  const { results: old } = await db.prepare('SELECT content_id FROM slots WHERE show_id = ?1 AND content_id IS NOT NULL').bind(showId).all();
  let t = start;
  const stmts = [db.prepare('DELETE FROM slots WHERE show_id = ?1').bind(showId)];
  tpl.forEach((r, i) => {
    stmts.push(db.prepare('INSERT INTO slots (show_id, position, start_min, duration_min, slot_type, label, public) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)').bind(showId, i, t, r.duration_min, r.slot_type, r.label));
    t += r.duration_min;
  });
  await db.batch(stmts);
  if (old.length && actor) await syncStages(db, old.map((o) => o.content_id), actor);
  if (actor) await refreshChanged(db, showId);
}

export async function updateShowMeta(db, id, f, actor) {
  await db
    .prepare("UPDATE shows SET air_date=?1, season=?2, title=?3, notes=?4, after_notes=?5, recording_url=?6, status=?7, published=?8, updated_at=datetime('now') WHERE id=?9")
    .bind(f.air_date, f.season, f.title, f.notes, f.after_notes, f.recording_url, f.status, f.published ? 1 : 0, id)
    .run();
  await audit(db, actor, 'show.update', 'show', id, f.status);
}

export async function deleteShow(db, id, actor) {
  const { results } = await db.prepare('SELECT content_id FROM slots WHERE show_id = ?1 AND content_id IS NOT NULL').bind(id).all();
  await db.batch([db.prepare('DELETE FROM slots WHERE show_id = ?1').bind(id), db.prepare('DELETE FROM shows WHERE id = ?1').bind(id)]);
  await syncStages(db, results.map((r) => r.content_id), actor);
  await audit(db, actor, 'show.delete', 'show', id);
}

/**
 * Save a show's full slot list, in order. rows: [{duration_min, slot_type, label, content_id, confirmed, public, notes}]
 * Start times are recomputed from the show start. A content item can only sit in one slot anywhere;
 * assigning it here removes it from any other slot.
 */
export async function saveSlots(db, showId, rows, actor) {
  const settings = await getSettings(db);
  let t = parseClock(settings.show_start);
  const { results: before } = await db.prepare('SELECT content_id FROM slots WHERE show_id = ?1 AND content_id IS NOT NULL').bind(showId).all();
  const newIds = rows.map((r) => r.content_id).filter(Boolean);
  const dupes = newIds.filter((id, i) => newIds.indexOf(id) !== i);
  if (dupes.length) throw new Error('The same content item is in two slots. Each item can fill only one slot.');

  // Other shows that currently hold any of these items lose them.
  let otherShows = [];
  if (newIds.length) {
    const { results } = await db
      .prepare(`SELECT DISTINCT show_id FROM slots WHERE show_id <> ?1 AND content_id IN (${newIds.map(() => '?').join(',')})`)
      .bind(showId, ...newIds)
      .all();
    otherShows = results.map((r) => r.show_id);
  }
  const stmts = [];
  if (newIds.length)
    stmts.push(db.prepare(`UPDATE slots SET content_id = NULL, confirmed = 0 WHERE show_id <> ?1 AND content_id IN (${newIds.map(() => '?').join(',')})`).bind(showId, ...newIds));
  stmts.push(db.prepare('DELETE FROM slots WHERE show_id = ?1').bind(showId));
  rows.forEach((r, i) => {
    stmts.push(
      db.prepare('INSERT INTO slots (show_id, position, start_min, duration_min, slot_type, label, content_id, confirmed, public, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
        .bind(showId, i, t, r.duration_min, r.slot_type, r.label, r.content_id || null, r.content_id && r.confirmed ? 1 : 0, r.public ? 1 : 0, r.notes || '')
    );
    t += r.duration_min;
  });
  stmts.push(db.prepare("UPDATE shows SET updated_at = datetime('now') WHERE id = ?1").bind(showId));
  await db.batch(stmts);
  await syncStages(db, [...new Set([...before.map((b) => b.content_id), ...newIds])], actor);
  for (const id of [showId, ...otherShows]) await refreshChanged(db, id);
  await audit(db, actor, 'show.layout', 'show', showId, `${rows.length} slots`);
}

/** Put one content item into one slot (used from the Inbox). */
export async function placeContent(db, contentId, slotId, actor) {
  const slot = await db.prepare('SELECT * FROM slots WHERE id = ?1').bind(slotId).first();
  if (!slot) throw new Error('That slot no longer exists.');
  const show = await getShow(db, slot.show_id);
  const rows = show.slots.map((s) => ({ ...s, content_id: s.id === slot.id ? contentId : s.content?.id === contentId ? null : s.content?.id || null }));
  const item = await db.prepare('SELECT kind FROM content_items WHERE id = ?1').bind(contentId).first();
  for (const r of rows) if (r.content_id === contentId) r.slot_type = item.kind; // slot type follows what's in it
  await saveSlots(db, slot.show_id, rows, actor);
  return slot.show_id;
}

/** Snapshot of what guests were told: content id -> start/duration. */
export const snapshotOf = (show) =>
  JSON.stringify(
    show.slots.filter((s) => s.content).map((s) => ({ c: s.content.id, t: s.start_min, d: s.duration_min })).sort((a, b) => a.c - b.c)
  );

export async function refreshChanged(db, showId) {
  const show = await getShow(db, showId);
  if (!show || !show.schedule_sent_at) return;
  const changed = snapshotOf(show) !== show.sent_snapshot ? 1 : 0;
  if (changed !== show.changed_since_sent) await db.prepare('UPDATE shows SET changed_since_sent = ?1 WHERE id = ?2').bind(changed, showId).run();
}

export async function markSent(db, showId, snapshot, actor) {
  await db
    .prepare("UPDATE shows SET schedule_sent_at = datetime('now'), schedule_sent_by = ?1, sent_snapshot = ?2, changed_since_sent = 0, status = CASE WHEN status = 'planning' THEN 'ready' ELSE status END WHERE id = ?3")
    .bind(actor, snapshot, showId)
    .run();
  await audit(db, actor, 'show.send', 'show', showId);
}

/** Shows whose air time has passed become Aired, and so does their content. */
export async function markAired(db, { today, hour }) {
  const { results } = await db
    .prepare("SELECT id FROM shows WHERE status <> 'aired' AND (air_date < ?1 OR (air_date = ?1 AND ?2 >= 12))")
    .bind(today, hour)
    .all();
  if (!results.length) return 0;
  const ids = results.map((r) => r.id);
  await db.prepare(`UPDATE shows SET status = 'aired' WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  const { results: cs } = await db.prepare(`SELECT content_id FROM slots WHERE content_id IS NOT NULL AND show_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  await syncStages(db, cs.map((c) => c.content_id), 'system');
  return ids.length;
}

/* ---------------- content ---------------- */

/** Recompute Scheduled/Aired/Approved from where each item currently sits. */
export async function syncStages(db, ids, actor) {
  for (const id of [...new Set(ids)].filter(Boolean)) {
    const c = await db.prepare('SELECT stage FROM content_items WHERE id = ?1').bind(id).first();
    if (!c) continue;
    const placed = await db.prepare('SELECT sh.status FROM slots sl JOIN shows sh ON sh.id = sl.show_id WHERE sl.content_id = ?1 LIMIT 1').bind(id).first();
    let to = c.stage;
    if (placed) to = placed.status === 'aired' ? 'aired' : 'scheduled';
    else if (c.stage === 'scheduled') to = 'approved';
    if (to !== c.stage) await setStage(db, id, to, placed ? '' : 'Removed from the show layout', actor, true);
  }
}

export async function setStage(db, id, to, note, actor, skipSync = false) {
  const c = await db.prepare('SELECT stage FROM content_items WHERE id = ?1').bind(id).first();
  if (!c) throw new Error('Content item not found.');
  const stmts = [
    db.prepare("UPDATE content_items SET stage = ?1, updated_at = datetime('now') WHERE id = ?2").bind(to, id),
    db.prepare('INSERT INTO content_history (content_id, from_stage, to_stage, note, actor) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, c.stage, to, note || '', actor),
  ];
  // Leaving the pipeline (declined/hold/withdrawn) frees any slot it was in.
  if (!skipSync && ['declined', 'hold', 'withdrawn', 'new', 'reviewing'].includes(to)) {
    const { results } = await db.prepare('SELECT DISTINCT show_id FROM slots WHERE content_id = ?1').bind(id).all();
    stmts.push(db.prepare('UPDATE slots SET content_id = NULL, confirmed = 0 WHERE content_id = ?1').bind(id));
    await db.batch(stmts);
    for (const r of results) await refreshChanged(db, r.show_id);
    return;
  }
  await db.batch(stmts);
}

const CONTENT_FIELDS = ['kind', 'title', 'public_name', 'public_note', 'description', 'link', 'organization', 'event_date', 'date_preferences', 'appearance', 'performers', 'setup_needs', 'contact_name', 'contact_email', 'contact_phone', 'internal_notes'];

export async function createContent(db, f, { source, stage = 'new', actor, ipHash = '', consent = 0 }) {
  const cols = [...CONTENT_FIELDS, 'source', 'stage', 'submitter_ip_hash', 'consent'];
  const vals = [...CONTENT_FIELDS.map((k) => f[k] ?? ''), source, stage, ipHash, consent ? 1 : 0];
  const row = await db
    .prepare(`INSERT INTO content_items (${cols.join(',')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(',')}) RETURNING id`)
    .bind(...vals)
    .first();
  await db.prepare('INSERT INTO content_history (content_id, to_stage, note, actor) VALUES (?1, ?2, ?3, ?4)')
    .bind(row.id, stage, source === 'form' ? 'Submitted through the website form' : 'Added by an admin', actor || 'public')
    .run();
  return row.id;
}

export async function updateContent(db, id, f, actor) {
  await db
    .prepare(`UPDATE content_items SET ${CONTENT_FIELDS.map((k, i) => `${k} = ?${i + 1}`).join(', ')}, updated_at = datetime('now') WHERE id = ?${CONTENT_FIELDS.length + 1}`)
    .bind(...CONTENT_FIELDS.map((k) => f[k] ?? ''), id)
    .run();
  await audit(db, actor, 'content.update', 'content', id);
  const { results } = await db.prepare('SELECT DISTINCT show_id FROM slots WHERE content_id = ?1').bind(id).all();
  for (const r of results) await refreshChanged(db, r.show_id);
}

export async function getContent(db, id) {
  const c = await db.prepare('SELECT * FROM content_items WHERE id = ?1').bind(id).first();
  if (!c) return null;
  const [history, placement, emails, related] = await Promise.all([
    db.prepare('SELECT * FROM content_history WHERE content_id = ?1 ORDER BY at DESC, id DESC').bind(id).all(),
    db.prepare('SELECT sl.*, sh.air_date, sh.status AS show_status FROM slots sl JOIN shows sh ON sh.id = sl.show_id WHERE sl.content_id = ?1').bind(id).first(),
    db.prepare('SELECT * FROM email_log WHERE content_id = ?1 ORDER BY id DESC').bind(id).all(),
    relatedContent(db, c),
  ]);
  return { ...c, history: history.results, placement, emails: emails.results, related };
}

/** Earlier items from the same person or organization (returning submitters). */
export async function relatedContent(db, c) {
  if (!c.contact_email && !c.organization) return [];
  const { results } = await db
    .prepare(
      `SELECT ci.id, ci.title, ci.stage, ci.created_at, (SELECT sh.air_date FROM slots sl JOIN shows sh ON sh.id = sl.show_id WHERE sl.content_id = ci.id LIMIT 1) AS air_date
       FROM content_items ci WHERE ci.id <> ?1 AND ((?2 <> '' AND lower(ci.contact_email) = lower(?2)) OR (?3 <> '' AND lower(ci.organization) = lower(?3)))
       ORDER BY ci.created_at DESC LIMIT 10`
    )
    .bind(c.id, c.contact_email, c.organization)
    .all();
  return results;
}

export async function listContent(db, { stages, q = '', limit = 300 } = {}) {
  const w = [], a = [];
  if (stages?.length) { w.push(`ci.stage IN (${stages.map(() => '?').join(',')})`); a.push(...stages); }
  if (q) { a.push(`%${q}%`); w.push(`(ci.title LIKE ?${a.length} OR ci.public_name LIKE ?${a.length} OR ci.organization LIKE ?${a.length} OR ci.contact_name LIKE ?${a.length} OR ci.contact_email LIKE ?${a.length})`); }
  a.push(limit);
  const { results } = await db
    .prepare(
      `SELECT ci.*, (SELECT sh.air_date FROM slots sl JOIN shows sh ON sh.id = sl.show_id WHERE sl.content_id = ci.id LIMIT 1) AS air_date,
        (SELECT COUNT(*) FROM content_items o WHERE o.id <> ci.id AND ((ci.contact_email <> '' AND lower(o.contact_email) = lower(ci.contact_email)) OR (ci.organization <> '' AND lower(o.organization) = lower(ci.organization)))) AS related_count
       FROM content_items ci ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ci.created_at DESC, ci.id DESC LIMIT ?${a.length}`
    )
    .bind(...a)
    .all();
  return results;
}

export async function stageCounts(db) {
  const { results } = await db.prepare('SELECT stage, COUNT(*) AS n FROM content_items GROUP BY stage').all();
  return Object.fromEntries(results.map((r) => [r.stage, r.n]));
}

/** Approved items not yet in any slot — what the layout pickers offer. */
export async function approvedUnplaced(db) {
  const { results } = await db
    .prepare("SELECT id, kind, title, public_name, organization, event_date, appearance FROM content_items WHERE stage = 'approved' AND id NOT IN (SELECT content_id FROM slots WHERE content_id IS NOT NULL) ORDER BY CASE WHEN event_date = '' THEN 1 ELSE 0 END, event_date, created_at")
    .all();
  return results;
}

/** Open slots in upcoming, not-yet-aired shows (Inbox → schedule directly). */
export async function openSlots(db, today) {
  const { results } = await db
    .prepare("SELECT sl.id, sl.label, sl.slot_type, sl.start_min, sh.air_date FROM slots sl JOIN shows sh ON sh.id = sl.show_id WHERE sh.status <> 'aired' AND sh.air_date >= ?1 AND sl.content_id IS NULL AND sl.slot_type NOT IN ('program','break') ORDER BY sh.air_date, sl.position LIMIT 200")
    .bind(today)
    .all();
  return results;
}

export async function recentSubmissionsFromIp(db, ipHash) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM content_items WHERE submitter_ip_hash = ?1 AND created_at > datetime('now', '-1 hour')").bind(ipHash).first();
  return r.n;
}

/** Erase contact details on declined/withdrawn items older than the retention period (R25). */
export async function purgeContacts(db, months) {
  const m = Math.max(1, Number(months) || 12);
  const r = await db
    .prepare(
      `UPDATE content_items SET contact_name = '', contact_email = '', contact_phone = '', submitter_ip_hash = '', contact_purged_at = datetime('now')
       WHERE stage IN ('declined','withdrawn') AND contact_purged_at IS NULL AND updated_at < datetime('now', ?1)`
    )
    .bind(`-${m} months`)
    .run();
  return r.meta.changes;
}

/* ---------------- users, templates, email log ---------------- */

export const listUsers = async (db) => (await db.prepare('SELECT * FROM users ORDER BY active DESC, role, email').all()).results;

export async function upsertUser(db, { email, name, role, active }, actor) {
  const e = email.toLowerCase();
  if (role !== 'owner' || !active) {
    const other = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND email <> ?1").bind(e).first();
    const cur = await db.prepare('SELECT role, active FROM users WHERE email = ?1').bind(e).first();
    if (cur && cur.role === 'owner' && cur.active && other.n === 0) throw new Error('There must always be at least one active owner.');
  }
  await db
    .prepare('INSERT INTO users (email, name, role, active, created_by) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, active = excluded.active')
    .bind(e, name, role, active ? 1 : 0, actor)
    .run();
  await audit(db, actor, 'user.save', 'user', null, `${e} ${role} ${active ? 'active' : 'inactive'}`);
}

export const getTemplate = async (db) => (await db.prepare('SELECT * FROM slot_templates ORDER BY position').all()).results;

export async function saveTemplate(db, rows, actor) {
  const stmts = [db.prepare('DELETE FROM slot_templates')];
  rows.forEach((r, i) => stmts.push(db.prepare('INSERT INTO slot_templates (position, duration_min, slot_type, label) VALUES (?1, ?2, ?3, ?4)').bind(i, r.duration_min, r.slot_type, r.label)));
  await db.batch(stmts);
  await audit(db, actor, 'template.save', '', null, `${rows.length} slots`);
}

export async function listEmails(db, { limit = 200 } = {}) {
  const { results } = await db.prepare('SELECT e.*, sh.air_date FROM email_log e LEFT JOIN shows sh ON sh.id = e.show_id ORDER BY e.id DESC LIMIT ?1').bind(limit).all();
  return results;
}
export const emailsForShow = async (db, id) => (await db.prepare('SELECT * FROM email_log WHERE show_id = ?1 ORDER BY id DESC').bind(id).all()).results;
