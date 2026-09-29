// Data access for D1.

export async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function saveSettings(db, obj) {
  const stmts = Object.entries(obj).map(([k, v]) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v)
  );
  if (stmts.length) await db.batch(stmts);
}

function attach(episodes, segments) {
  const byEp = new Map(episodes.map((e) => [e.id, { ...e, segments: [] }]));
  for (const s of segments) byEp.get(s.episode_id)?.segments.push(s);
  return [...byEp.values()];
}

/** Episodes with their segments. opts: { season, from, to, includeUnpublished } */
export async function listEpisodes(db, opts = {}) {
  const where = [];
  const args = [];
  if (!opts.includeUnpublished) where.push('published = 1');
  if (opts.season) { args.push(opts.season); where.push(`season = ?${args.length}`); }
  if (opts.from) { args.push(opts.from); where.push(`air_date >= ?${args.length}`); }
  if (opts.to) { args.push(opts.to); where.push(`air_date <= ?${args.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const eps = (await db.prepare(`SELECT * FROM episodes ${w} ORDER BY air_date`).bind(...args).all()).results;
  if (!eps.length) return [];
  const ids = eps.map((e) => e.id);
  const segs = (
    await db.prepare(`SELECT * FROM segments WHERE episode_id IN (${ids.map(() => '?').join(',')}) ORDER BY episode_id, position`).bind(...ids).all()
  ).results;
  return attach(eps, segs);
}

export async function listSeasons(db) {
  const { results } = await db
    .prepare("SELECT season, MIN(air_date) AS first FROM episodes WHERE published = 1 AND season <> '' GROUP BY season ORDER BY first DESC")
    .all();
  return results.map((r) => r.season);
}

export async function getEpisode(db, id) {
  const ep = await db.prepare('SELECT * FROM episodes WHERE id = ?1').bind(id).first();
  if (!ep) return null;
  const { results } = await db.prepare('SELECT * FROM segments WHERE episode_id = ?1 ORDER BY position').bind(id).all();
  return { ...ep, segments: results };
}

export async function getEpisodeByDate(db, date) {
  const ep = await db.prepare('SELECT id FROM episodes WHERE air_date = ?1 AND published = 1').bind(date).first();
  return ep ? getEpisode(db, ep.id) : null;
}

/** Insert or update an episode and replace its segments atomically. Returns the episode id. */
export async function saveEpisode(db, data, id = null) {
  let epId = id;
  if (epId) {
    await db
      .prepare("UPDATE episodes SET air_date=?1, season=?2, title=?3, notes=?4, published=?5, updated_at=datetime('now') WHERE id=?6")
      .bind(data.air_date, data.season, data.title, data.notes, data.published ? 1 : 0, epId)
      .run();
  } else {
    const row = await db
      .prepare('INSERT INTO episodes (air_date, season, title, notes, published) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id')
      .bind(data.air_date, data.season, data.title, data.notes, data.published ? 1 : 0)
      .first();
    epId = row.id;
  }
  const stmts = [db.prepare('DELETE FROM segments WHERE episode_id = ?1').bind(epId)];
  data.segments.forEach((s, i) =>
    stmts.push(
      db.prepare('INSERT INTO segments (episode_id, position, kind, name, url, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(epId, i, s.kind, s.name, s.url, s.note)
    )
  );
  await db.batch(stmts);
  return epId;
}

export async function deleteEpisode(db, id) {
  await db.batch([
    db.prepare('DELETE FROM segments WHERE episode_id = ?1').bind(id),
    db.prepare('DELETE FROM episodes WHERE id = ?1').bind(id),
  ]);
}
