// End-to-end test against `wrangler dev` (DEV_ADMIN_BYPASS=true, fresh local DB with migrations applied).
// Usage: node scripts/e2e-test.mjs [baseUrl]
import { execFileSync } from 'node:child_process';

const B = process.argv[2] || 'http://localhost:8787';
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); } };
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'trivial-thursdays', '--local', '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;

async function req(path, { method = 'GET', form, as, origin = B, headers = {} } = {}) {
  const h = { ...headers };
  if (as) h['x-dev-as'] = as;
  let body;
  if (form) {
    body = new URLSearchParams();
    for (const [k, v] of Array.isArray(form) ? form : Object.entries(form)) body.append(k, v);
    if (origin) h.origin = origin;
  }
  let r;
  for (let i = 0; ; i++) {
    try { r = await fetch(B + path, { method: form ? 'POST' : method, body, headers: h, redirect: 'manual' }); break; }
    catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 300)); } // dev server drops keep-alive sockets after external DB reads
  }
  return { status: r.status, loc: r.headers.get('location') || '', text: await r.text(), headers: r.headers };
}
const msgOf = (loc) => decodeURIComponent((loc.split('msg=')[1] || '').replace(/\+/g, ' '));

console.log('Public pages');
{
  const home = await req('/');
  ok(home.status === 200 && /Next show|Today|On air now/.test(home.text), 'home renders next show (or today / on air)');
  ok(/content-security-policy/i.test([...home.headers.keys()].join(' ')), 'CSP header present');
  ok(!/onerror=|onclick=|onsubmit=/.test(home.text), 'no inline event handlers');
  const api = JSON.parse((await req('/api/episodes')).text);
  ok(api.episodes.length === 27, 'API lists 27 shows', api.episodes.length);
  ok(api.episodes.find((e) => e.air_date === '2026-10-01').segments.length === 3, 'Oct 1 has 3 public segments');
}

console.log('Suggestion form');
const email = 'jane.doe@example.org';
{
  const bad = await req('/suggest', { form: { contact_name: '', contact_email: 'nope', kind: 'guest', title: '', description: 'x' } });
  ok(bad.status === 400 && bad.text.includes('valid email'), 'validation errors shown');
  const hp = await req('/suggest', { form: { website: 'spam', contact_name: 'Bot', contact_email: 'b@b.co', kind: 'guest', title: 'Spam', description: 'buy now buy now', consent: '1' } });
  ok(hp.status === 200 && sql("SELECT COUNT(*) n FROM content_items WHERE title='Spam'")[0].n === 0, 'honeypot silently drops bots');
  const xorigin = await req('/suggest', { form: { contact_name: 'X' }, origin: 'https://evil.example' });
  ok(xorigin.status === 403, 'cross-origin form post blocked');
  const good = await req('/suggest', { form: { contact_name: 'Jane Doe', contact_email: email, contact_phone: '859-555-0100', organization: 'Lexington Tree Collective', kind: 'guest', title: 'Fall tree planting <script>alert(1)</script>', description: 'Volunteers planting 500 trees across Lexington parks.', event_date: '2026-10-24', appearance: 'studio', consent: '1' } });
  ok(good.status === 200 && good.text.includes('Thanks, Jane'), 'valid submission accepted');
  await new Promise((r) => setTimeout(r, 800));
  const logs = sql("SELECT kind, status, to_addr FROM email_log ORDER BY id");
  ok(logs.some((l) => l.kind === 'submission_ack' && l.status === 'logged' && l.to_addr === email), 'confirmation logged (guest email off)');
  ok(!logs.some((l) => l.kind === 'submission_alert'), 'no alert while Mick’s email is blank');
}
const cid = sql("SELECT id FROM content_items WHERE contact_email='jane.doe@example.org'")[0].id;

console.log('Settings (owner)');
{
  const r = await req('/admin/settings', { form: [['alert_email', 'mick@example.com, Brian@Example.com'], ['arrive_before_min', '15'], ['station_address', 'WRFL, 171 Student Center, Lexington KY'], ['dayof_contact', 'Studio line 859-555-0199'], ['email_admins_enabled', '0'], ['email_admins_enabled', '1']] });
  ok(msgOf(r.loc) === 'Settings saved.', 'settings saved');
  const s = Object.fromEntries(sql("SELECT key, value FROM settings").map((x) => [x.key, x.value]));
  ok(s.alert_email === 'mick@example.com, brian@example.com' && s.email_admins_enabled === '1' && s.tagline.length > 20, 'partial save keeps other settings; two notification addresses saved');
  const badAddr = await req('/admin/settings', { form: { alert_email: 'mick@example.com, not-an-email' } });
  ok(/not a valid email address: not-an-email/.test(msgOf(badAddr.loc)), 'invalid notification address rejected');
  await req('/suggest', { form: { contact_name: 'Jane Doe', contact_email: email, kind: 'music', title: 'Jane Doe Trio', description: 'Jazz trio playing originals.', performers: '3', consent: '1' } });
  await new Promise((r) => setTimeout(r, 800));
  const alert = sql("SELECT status, error, to_addr FROM email_log WHERE kind='submission_alert'");
  ok(alert.length === 2 && alert.every((a) => a.status === 'logged'), 'alert logged for both notification addresses', JSON.stringify(alert));
}

console.log('Inbox → approve → schedule');
{
  const inbox = await req('/admin/inbox');
  ok(inbox.text.includes('Fall tree planting &lt;script&gt;') && !inbox.text.includes('<script>alert(1)'), 'inbox escapes submitted HTML');
  ok(inbox.text.includes('Returning'), 'second submission flagged as returning');
  const ap = await req(`/admin/content/${cid}/stage`, { form: { stage: 'approved', note: 'Great fit for Tree Week follow-up' } });
  ok(msgOf(ap.loc).startsWith('Marked approved'), 'approved');
  const slot = sql("SELECT sl.id FROM slots sl JOIN shows sh ON sh.id=sl.show_id WHERE sh.air_date='2026-10-01' AND sl.label='Musical guest'")[0].id;
  const pl = await req(`/admin/content/${cid}/place`, { form: { slot_id: String(slot) } });
  ok(pl.status === 303 && msgOf(pl.loc).startsWith('Scheduled'), 'scheduled into Oct 1', pl.loc);
  const st = sql(`SELECT stage FROM content_items WHERE id=${cid}`)[0].stage;
  ok(st === 'scheduled', 'stage became Scheduled');
  const hist = sql(`SELECT to_stage, actor FROM content_history WHERE content_id=${cid} ORDER BY id`);
  ok(hist.map((h) => h.to_stage).join('>') === 'new>approved>scheduled' && hist[1].actor === 'owner@dev.local', 'history records stages and who', JSON.stringify(hist));
  const typ = sql(`SELECT slot_type FROM slots WHERE content_id=${cid}`)[0].slot_type;
  ok(typ === 'guest', 'music slot retyped to guest for a guest item', typ);
}

const showId = sql("SELECT id FROM shows WHERE air_date='2026-10-01'")[0].id;
const layoutForm = (rows) => rows.flatMap((r) => [['duration_min', String(r.duration_min)], ['slot_type', r.slot_type], ['label', r.label], ['content_id', r.content_id ? String(r.content_id) : ''], ['confirmed', r.confirmed ? '1' : '0'], ['public', r.public === 0 ? '0' : '1'], ['notes', r.notes || '']]);
const slotsOf = (id) => sql(`SELECT * FROM slots WHERE show_id=${id} ORDER BY position`);

console.log('Show layout editing');
{
  let rows = slotsOf(showId);
  // swap guest 1 and 2, shorten open to 3 min, confirm everyone
  [rows[1], rows[2]] = [rows[2], rows[1]];
  rows[0].duration_min = 3;
  rows = rows.map((r) => ({ ...r, confirmed: 1 }));
  const r = await req(`/admin/shows/${showId}/layout`, { form: layoutForm(rows) });
  ok(msgOf(r.loc) === 'Layout saved.', 'layout saved');
  const after = slotsOf(showId);
  ok(after[1].start_min === 603 && after[2].start_min === 628, 'start times recomputed', `${after[1].start_min},${after[2].start_min}`);
  const page = await req(`/admin/shows/${showId}`);
  ok(page.text.includes('Runs 118 min'), 'total-time warning shows');
  const dup = await req(`/admin/shows/${showId}/layout`, { form: layoutForm(after.map((x, i) => (i === 6 ? { ...x, content_id: after[1].content_id } : x))) });
  ok(/same content item/.test(msgOf(dup.loc)), 'duplicate assignment rejected');
  rows = slotsOf(showId); rows[0].duration_min = 5;
  await req(`/admin/shows/${showId}/layout`, { form: layoutForm(rows) });
}

console.log('Send final schedule');
{
  const prev = await req(`/admin/shows/${showId}/send`);
  ok(prev.text.includes('Email 1:') && prev.text.includes('jane.doe@example.org'), 'preview lists forwarding addresses');
  const fwdBlock = prev.text.split('Email 2:')[0];
  ok(!fwdBlock.includes('859-555-0100') && fwdBlock.includes('please arrive by 11:10 AM'), 'forwardable email has no contact details; arrival time correct');
  const s = await req(`/admin/shows/${showId}/send`, { form: {} });
  ok(/Final schedule/.test(msgOf(s.loc)), 'sent', msgOf(s.loc));
  const sh = sql(`SELECT status, schedule_sent_at, changed_since_sent FROM shows WHERE id=${showId}`)[0];
  ok(sh.status === 'ready' && sh.schedule_sent_at && sh.changed_since_sent === 0, 'show marked Ready and sent');
  const mails = sql(`SELECT kind, to_addr FROM email_log WHERE show_id=${showId}`);
  ok(mails.length === 4 && ['mick@example.com', 'brian@example.com'].every((a) => mails.filter((m) => m.to_addr === a).length === 2), 'forwardable + run sheet to each notification address');

  // change: remove Scott Whiddon from the layout
  let rows = slotsOf(showId);
  const scott = sql("SELECT id FROM content_items WHERE public_name='Musician Scott Whiddon'")[0].id;
  rows = rows.map((r) => (r.content_id === scott ? { ...r, content_id: null } : r));
  await req(`/admin/shows/${showId}/layout`, { form: layoutForm(rows) });
  ok(sql(`SELECT changed_since_sent c FROM shows WHERE id=${showId}`)[0].c === 1, 'change flagged after send');
  ok(sql(`SELECT stage FROM content_items WHERE id=${scott}`)[0].stage === 'approved', 'removed item went back to Approved');
  const p2 = await req(`/admin/shows/${showId}/send`);
  ok(p2.text.includes('Removed: Musician Scott Whiddon') && p2.text.includes('UPDATED:'), 'update preview lists the change');
  // put it back → flag clears on its own
  rows = slotsOf(showId).map((r, i) => (i === 4 ? { ...r, content_id: scott, confirmed: 1 } : r));
  await req(`/admin/shows/${showId}/layout`, { form: layoutForm(rows) });
  ok(sql(`SELECT changed_since_sent c FROM shows WHERE id=${showId}`)[0].c === 0, 'restoring the sent layout clears the flag');
  // decline a scheduled item → slot freed + flag
  const lwv = sql(`SELECT content_id FROM slots WHERE show_id=${showId} AND content_id IS NOT NULL ORDER BY position LIMIT 1`)[0].content_id;
  await req(`/admin/content/${lwv}/stage`, { form: { stage: 'hold', note: 'Moving to later date' } });
  ok(sql(`SELECT COUNT(*) n FROM slots WHERE content_id=${lwv}`)[0].n === 0 && sql(`SELECT changed_since_sent c FROM shows WHERE id=${showId}`)[0].c === 1, 'putting an item on hold frees its slot and flags the show');
  const s2 = await req(`/admin/shows/${showId}/send`, { form: {} });
  ok(/Updated schedule/.test(msgOf(s2.loc)) && sql(`SELECT changed_since_sent c FROM shows WHERE id=${showId}`)[0].c === 0, 'updated schedule sent, flag cleared');
}

console.log('Email subject prefix');
{
  const subs = sql('SELECT subject FROM email_log');
  ok(subs.length > 0 && subs.every((r) => r.subject.startsWith('[TEST] ')), 'every email subject starts with [TEST]', JSON.stringify(subs.slice(0, 2)));
  const prev = await req(`/admin/shows/${showId}/send`);
  ok(prev.text.includes('Email 1: [TEST] '), 'send preview shows the prefix');
}

console.log('Public view reflects layout, no private data');
{
  const sched = await req('/schedule');
  ok(sched.text.includes('Fall tree planting'), 'new guest appears publicly');
  const all = (await req('/')).text + sched.text + (await req('/api/episodes')).text + (await req('/calendar.ics')).text;
  ok(!all.includes(email) && !all.includes('859-555-0100') && !all.includes('mick@example.com'), 'no contact details on public pages/feeds');
}

console.log('Roles');
{
  const add = async (e, role) => req('/admin/people', { form: { email: e, name: e.split('@')[0], role, active: '1' } });
  ok(msgOf((await add('pat@example.com', 'producer')).loc).startsWith('Saved'), 'owner adds producer');
  await add('val@example.com', 'viewer');
  const v1 = await req('/admin', { as: 'val@example.com' });
  ok(v1.status === 200 && !v1.text.includes('+ Add show'), 'viewer sees layout without edit controls');
  const v2 = await req(`/admin/shows/${showId}/layout`, { as: 'val@example.com', form: layoutForm(slotsOf(showId)) });
  ok(v2.status === 403, 'viewer cannot save layout');
  ok((await req('/admin/settings', { as: 'val@example.com' })).status === 403, 'viewer cannot open settings');
  ok((await req(`/admin/shows/${showId}/send`, { as: 'val@example.com' })).status === 403, 'viewer cannot send');
  ok((await req('/admin/settings', { as: 'pat@example.com' })).status === 403, 'producer cannot open settings');
  ok((await req('/admin/people', { as: 'pat@example.com' })).status === 403, 'producer cannot manage people');
  ok((await req(`/admin/shows/${showId}/send`, { as: 'pat@example.com' })).status === 200, 'producer can open send');
  ok((await req('/admin', { as: 'stranger@example.com' })).status === 403, 'unknown signed-in user denied');
  const demote = await req('/admin/people', { form: { email: 'owner@dev.local', name: '', role: 'viewer', active: '1' } });
  ok(/at least one active owner/.test(msgOf(demote.loc)), 'last owner cannot be demoted');
  await add('val@example.com', 'viewer').then(() => req('/admin/people', { form: { email: 'val@example.com', name: 'val', role: 'viewer', active: '0' } }));
  ok((await req('/admin', { as: 'val@example.com' })).status === 403, 'removed person loses access');
  const xs = await req(`/admin/shows/${showId}/delete`, { form: {}, origin: 'https://evil.example' });
  ok(xs.status === 403, 'cross-origin admin POST blocked');
}

console.log('Default layout & new shows');
{
  const tpl = [['duration_min', '10'], ['slot_type', 'program'], ['label', 'Open'], ['duration_min', '50'], ['slot_type', 'guest'], ['label', 'Long interview'], ['duration_min', '60'], ['slot_type', 'music'], ['label', 'Live set']];
  const r = await req('/admin/settings/template', { form: tpl });
  ok(/Default layout saved/.test(msgOf(r.loc)), 'default layout saved');
  const add = await req('/admin/shows', { form: { air_date: '2027-03-04' } });
  const newId = Number(add.loc.match(/shows\/(\d+)/)?.[1]);
  const rows = slotsOf(newId);
  ok(rows.length === 3 && rows[2].start_min === 660 && rows[1].label === 'Long interview', 'new show uses the edited layout');
  ok(slotsOf(showId).length >= 7, 'existing shows unchanged');
  const dup = await req('/admin/shows', { form: { air_date: '2027-03-04' } });
  ok(/already a show/.test(msgOf(dup.loc)), 'duplicate date rejected');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
