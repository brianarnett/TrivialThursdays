// Trivial Thursdays on WRFL — Cloudflare Worker entry point.
import { resolveUser, can } from './auth.js';
import * as db from './data.js';
import * as mail from './email.js';
import { layout, newNonce, csp } from './views/layout.js';
import * as pub from './views/public.js';
import * as adm from './views/admin.js';
import { esc, showClock, nextThursdayOnOrAfter, addDays, str, isDate, isEmail, emailList, safeUrl, sha256, parseClock, KIND_LABEL, SLOT_LABEL, APPEAR_LABEL } from './util.js';

const TZ = (env) => env.SHOW_TZ || 'America/New_York';

function htmlResponse(body, nonce, { status = 200, cache = 'no-store', headers = {} } = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': csp(nonce),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cache-control': cache,
      ...headers,
    },
  });
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } });
const redirect = (to) => new Response(null, { status: 303, headers: { location: to } });
const withMsg = (path, msg) => `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`;

/* ---------------- public ---------------- */

async function handlePublic(request, env, ctx, url) {
  const nonce = newNonce();
  const settings = await db.getSettings(env.DB);
  const clock = showClock(TZ(env));
  const { today, hour, weekday } = clock;
  const page = (opts, status = 200, cache = 'public, max-age=60') => htmlResponse(layout({ settings, nonce, ...opts }), nonce, { status, cache });
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/healthz') return json({ ok: true, today });

  if (path === '/suggest') {
    const turnstileKey = env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : '';
    const head = turnstileKey ? `<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : '';
    if (request.method === 'POST') return handleSuggest(request, env, ctx, { settings, nonce, turnstileKey, head, url });
    return page({ title: 'Suggest a guest or event', body: pub.suggestPage({ turnstileKey }), current: 'suggest', head }, 200, 'no-store');
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  ctx.waitUntil(db.markAired(env.DB, clock).catch((e) => console.error('markAired', e)));

  if (path === '/') {
    const shows = await db.listShows(env.DB, { from: today, limit: 7, publishedOnly: true });
    const [next, ...rest] = shows;
    const onAir = !!next && next.air_date === today && weekday === 'Thu' && hour >= 10 && hour < 12;
    return page({ body: pub.homePage({ settings, next, upcoming: rest, today, onAir }), current: 'home' });
  }

  if (path === '/schedule') {
    const seasons = await db.listSeasons(env.DB);
    const season = url.searchParams.get('season') || settings.current_season || seasons[0] || '';
    const shows = await db.listShows(env.DB, { season: season || undefined, publishedOnly: true });
    return page({ title: `${season} guest schedule`, body: pub.schedulePage({ season, seasons, shows, today }), current: 'schedule' });
  }

  if (path === '/api/episodes') {
    const season = url.searchParams.get('season') || undefined;
    const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : undefined;
    const shows = await db.listShows(env.DB, { season, from, publishedOnly: true });
    return json({
      show: { name: 'Trivial Thursdays on WRFL', airtime: settings.airtime, station: settings.station_name, timezone: TZ(env) },
      episodes: shows.map((sh) => ({
        air_date: sh.air_date, season: sh.season, title: sh.title,
        segments: pub.publicLineup(sh).map((sl) => ({ start: sl.start_min, minutes: sl.duration_min, kind: sl.content.kind, name: sl.content.public_name, url: safeUrl(sl.content.link), note: sl.content.public_note })),
      })),
    });
  }

  if (path === '/calendar.ics') {
    const shows = await db.listShows(env.DB, { publishedOnly: true });
    return new Response(toIcs(shows, settings), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="trivial-thursdays.ics"', 'cache-control': 'public, max-age=300' } });
  }

  if (path === '/p/trivial-thursdays-on-wrfl-guest-schedule.html') return Response.redirect(`${url.origin}/schedule`, 301);

  return page({ title: 'Not found', body: pub.notFoundPage() }, 404);
}

async function handleSuggest(request, env, ctx, { settings, nonce, turnstileKey, head, url }) {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('Bad origin', { status: 403 });
  const form = await request.formData();
  const values = {
    contact_name: str(form, 'contact_name', 120), contact_email: str(form, 'contact_email', 254), contact_phone: str(form, 'contact_phone', 40),
    organization: str(form, 'organization', 160), kind: str(form, 'kind', 20), title: str(form, 'title', 160), description: str(form, 'description', 3000),
    event_date: str(form, 'event_date', 10), appearance: str(form, 'appearance', 10), date_preferences: str(form, 'date_preferences', 300),
    performers: str(form, 'performers', 80), setup_needs: str(form, 'setup_needs', 300), link: str(form, 'link', 500), consent: form.get('consent') === '1',
  };
  const again = (errors, status = 400) =>
    htmlResponse(layout({ settings, nonce, head, title: 'Suggest a guest or event', current: 'suggest', body: pub.suggestPage({ values, errors, turnstileKey }) }), nonce, { status });

  // Bots fill the hidden field; pretend success so they learn nothing.
  if (str(form, 'website')) return htmlResponse(layout({ settings, nonce, title: 'Thanks', body: pub.thanksPage({ name: '' }) }), nonce);

  const errors = [];
  if (!values.contact_name) errors.push('Your name is required.');
  if (!isEmail(values.contact_email)) errors.push('A valid email address is required.');
  if (!KIND_LABEL[values.kind]) errors.push('Choose what you are suggesting.');
  if (!values.title) errors.push('A title or topic is required.');
  if (values.description.length < 10) errors.push('Tell us a little more about it.');
  if (values.event_date && !isDate(values.event_date)) errors.push('The event date is not a valid date.');
  if (!['', 'studio', 'phone', 'remote'].includes(values.appearance)) values.appearance = '';
  if (values.link && !safeUrl(values.link)) errors.push('The link must start with http:// or https://.');
  if (!values.consent) errors.push('Please confirm the show may contact you.');
  if (errors.length) return again(errors);

  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (turnstileKey) {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', str(form, 'cf-turnstile-response', 4000));
    body.append('remoteip', ip);
    const ok = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }).then((r) => r.json()).then((j) => j.success).catch(() => false);
    if (!ok) return again(['The spam check did not pass. Please try again.']);
  }
  const ipHash = await sha256(`${env.IP_HASH_SALT || 'trivial-thursdays'}:${ip}`);
  if ((await db.recentSubmissionsFromIp(env.DB, ipHash)) >= 5) return again(['Thanks for your enthusiasm! That is a lot of suggestions at once; please try again in an hour.'], 429);

  const id = await db.createContent(env.DB, { ...values, public_name: values.title, link: safeUrl(values.link) }, { source: 'form', stage: 'new', ipHash, consent: values.consent, actor: 'public' });
  const c = await db.getContent(env.DB, id);
  const info = { ...c, kind_label: KIND_LABEL[c.kind], related_count: c.related.length };
  const base = settings.site_url || url.origin;
  ctx.waitUntil(
    (async () => {
      const ack = mail.submissionAck(settings, info);
      await mail.sendEmail(env, settings, { kind: 'submission_ack', to: c.contact_email, content_id: id, ...ack });
      const alert = mail.submissionAlert(settings, info, `${base}/admin/content/${id}`);
      for (const to of emailList(settings.alert_email))
        await mail.sendEmail(env, settings, { kind: 'submission_alert', to, content_id: id, replyTo: c.contact_email, ...alert });
    })().catch((e) => console.error('submission email', e))
  );
  return htmlResponse(layout({ settings, nonce, title: 'Thanks', current: 'suggest', body: pub.thanksPage({ name: values.contact_name.split(' ')[0] }) }), nonce);
}

function toIcs(shows, settings) {
  const e = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trivial Thursdays//Schedule//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Trivial Thursdays on WRFL', 'X-WR-TIMEZONE:America/New_York',
    'BEGIN:VTIMEZONE', 'TZID:America/New_York',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const sh of shows) {
    const d = sh.air_date.replace(/-/g, '');
    const lineup = pub.publicLineup(sh).map((sl) => (sl.content.kind === 'music' ? `Musical guest: ${sl.content.public_name}` : sl.content.public_name)).join('\n') || 'Lineup to be announced';
    lines.push('BEGIN:VEVENT', `UID:tt-${sh.air_date}@trivialthursdays.com`, `DTSTAMP:${stamp}`, `DTSTART;TZID=America/New_York:${d}T100000`, `DTEND;TZID=America/New_York:${d}T120000`,
      `SUMMARY:${e(sh.title || 'Trivial Thursdays on WRFL')}`, `DESCRIPTION:${e(lineup)}`, `LOCATION:${e(settings.station_name || 'WRFL-FM 88.1')}`, settings.station_url ? `URL:${settings.station_url}` : '', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

/* ---------------- admin ---------------- */

function parseContentForm(form) {
  const f = {};
  for (const k of ['title', 'public_name', 'public_note', 'organization', 'date_preferences', 'performers', 'setup_needs', 'contact_name', 'contact_phone']) f[k] = str(form, k, 300);
  f.description = str(form, 'description', 5000);
  f.internal_notes = str(form, 'internal_notes', 5000);
  f.kind = KIND_LABEL[str(form, 'kind')] ? str(form, 'kind') : 'guest';
  f.appearance = APPEAR_LABEL[str(form, 'appearance')] !== undefined ? str(form, 'appearance') : '';
  f.link = safeUrl(str(form, 'link', 500));
  f.event_date = isDate(str(form, 'event_date')) ? str(form, 'event_date') : '';
  f.contact_email = str(form, 'contact_email', 254);
  if (f.contact_email && !isEmail(f.contact_email)) throw new Error('Error: the contact email is not valid.');
  if (!f.title) throw new Error('Error: a title is required.');
  if (!f.public_name) f.public_name = f.title;
  return f;
}

function parseRows(form, { withContent }) {
  const dur = form.getAll('duration_min'), type = form.getAll('slot_type'), label = form.getAll('label');
  const content = form.getAll('content_id'), conf = form.getAll('confirmed'), pubs = form.getAll('public'), notes = form.getAll('notes');
  return dur.map((d, i) => ({
    duration_min: Math.max(0, Math.min(240, parseInt(d, 10) || 0)),
    slot_type: SLOT_LABEL[type[i]] ? type[i] : 'guest',
    label: String(label[i] || '').trim().slice(0, 80) || SLOT_LABEL[type[i]] || 'Segment',
    ...(withContent
      ? { content_id: parseInt(content[i], 10) || null, confirmed: conf[i] === '1', public: pubs[i] !== '0', notes: String(notes[i] || '').trim().slice(0, 1000) }
      : {}),
  }));
}

/** Compare the last-sent snapshot with the current layout. */
async function diffSinceSent(env, show) {
  if (!show.schedule_sent_at || !show.sent_snapshot) return null;
  let old = [];
  try { old = JSON.parse(show.sent_snapshot); } catch {}
  const now = new Map(show.slots.filter((s) => s.content).map((s) => [s.content.id, s]));
  const was = new Map(old.map((o) => [o.c, o]));
  const added = [], moved = [], removed = [];
  for (const [id, s] of now) {
    const o = was.get(id);
    if (!o) added.push(s.content);
    else if (o.t !== s.start_min || o.d !== s.duration_min) moved.push(s.content);
  }
  for (const [id] of was) {
    if (now.has(id)) continue;
    const c = await env.DB.prepare('SELECT id, public_name, title, contact_email FROM content_items WHERE id = ?1').bind(id).first();
    if (c) removed.push({ ...c, public_name: c.public_name || c.title });
  }
  return { added, moved, removed };
}

function buildScheduleEmails(settings, show, changes) {
  const update = !!show.schedule_sent_at;
  const filled = show.slots.filter((s) => s.content);
  const forwardTo = [...new Set(filled.map((s) => s.content.contact_email).filter(isEmail))];
  const missing = filled.filter((s) => !isEmail(s.content.contact_email)).map((s) => s.content.public_name);
  const forward = mail.scheduleForward(settings, show, { update });
  const owner = mail.scheduleOwner(settings, show, { update, forwardTo, changes, missing });
  return { update, forwardTo, missing, forward, owner };
}

async function handleAdmin(request, env, ctx, url) {
  const nonce = newNonce();
  const settingsP = db.getSettings(env.DB);
  const auth = await resolveUser(request, env, ctx);
  const settings = await settingsP;
  if (auth.error) return htmlResponse(layout({ settings, nonce, title: 'No access', body: adm.deniedPage(auth.error), bare: false }), nonce, { status: 403 });
  const user = auth.user;
  const perm = { edit: can(user, 'edit'), send: can(user, 'send'), admin: can(user, 'admin') };
  const actor = user.email;

  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('Bad origin', { status: 403 });
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return new Response('Cross-site request blocked', { status: 403 });
  }
  const clock = showClock(TZ(env));
  const { today } = clock;
  await db.markAired(env.DB, clock);
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const flash = url.searchParams.get('msg') || '';
  const counts = await db.stageCounts(env.DB);
  const page = (title, body, current, extra = {}) => htmlResponse(layout({ title, settings, nonce, body, current, admin: { user, counts }, ...extra }), nonce);
  const forbid = () => htmlResponse(layout({ title: 'Not allowed', settings, nonce, admin: { user, counts }, body: adm.deniedPage("Your role doesn't allow that. Ask an owner if you need more access.") }), nonce, { status: 403 });
  const need = (p) => (perm[p] ? null : forbid());
  const post = request.method === 'POST';
  let m;

  try {
    /* ---- Show Layout ---- */
    if (path === '/admin' && !post) {
      const shows = await db.listShows(env.DB, { from: today, limit: 14 });
      const upcoming = shows.filter((s) => s.status !== 'aired');
      const last = await env.DB.prepare('SELECT MAX(air_date) AS d FROM shows').first();
      const nextDate = nextThursdayOnOrAfter(last?.d && last.d >= today ? addDays(last.d, 1) : today);
      return page('Show Layout', adm.layoutList({ shows: upcoming, settings, perm, flash, nextDate, today }), 'layout');
    }
    if (path === '/admin/shows' && post) {
      if (need('edit')) return need('edit');
      const form = await request.formData();
      const air_date = str(form, 'air_date');
      if (!isDate(air_date)) return redirect(withMsg('/admin', 'Error: choose a date.'));
      if (await env.DB.prepare('SELECT id FROM shows WHERE air_date = ?1').bind(air_date).first()) return redirect(withMsg('/admin', 'Error: there is already a show on that date.'));
      const id = await db.createShow(env.DB, { air_date, season: settings.current_season || '' }, actor);
      return redirect(withMsg(`/admin/shows/${id}`, 'Show added with the default layout.'));
    }
    if ((m = path.match(/^\/admin\/shows\/(\d+)(?:\/(layout|reset|delete|send|runsheet))?$/))) {
      const id = Number(m[1]), action = m[2] || '';
      const show = await db.getShow(env.DB, id);
      if (!show) return redirect(withMsg('/admin', 'Error: that show no longer exists.'));
      if (!action && !post) {
        const [approved, emails] = await Promise.all([db.approvedUnplaced(env.DB), db.emailsForShow(env.DB, id)]);
        return page(`Show ${show.air_date}`, adm.showDetail({ show, settings, approved, perm, flash, emails, startMin: parseClock(settings.show_start) }), show.status === 'aired' ? 'past' : 'layout');
      }
      if (!action && post) {
        if (need('edit')) return need('edit');
        const form = await request.formData();
        const f = {
          air_date: isDate(str(form, 'air_date')) ? str(form, 'air_date') : show.air_date, season: str(form, 'season', 60), title: str(form, 'title', 160),
          notes: str(form, 'notes', 5000), after_notes: str(form, 'after_notes', 5000), recording_url: safeUrl(str(form, 'recording_url', 500)),
          status: ['planning', 'ready', 'aired'].includes(str(form, 'status')) ? str(form, 'status') : show.status, published: str(form, 'published') !== '0',
        };
        if (f.air_date !== show.air_date && (await env.DB.prepare('SELECT id FROM shows WHERE air_date = ?1').bind(f.air_date).first()))
          return redirect(withMsg(`/admin/shows/${id}`, 'Error: there is already a show on that date.'));
        await db.updateShowMeta(env.DB, id, f, actor);
        if (f.status === 'aired') await db.syncStages(env.DB, show.slots.filter((s) => s.content).map((s) => s.content.id), actor);
        return redirect(withMsg(`/admin/shows/${id}`, 'Show details saved.'));
      }
      if (action === 'layout' && post) {
        if (need('edit')) return need('edit');
        const rows = parseRows(await request.formData(), { withContent: true });
        if (!rows.length) return redirect(withMsg(`/admin/shows/${id}`, 'Error: a show needs at least one slot.'));
        await db.saveSlots(env.DB, id, rows, actor);
        return redirect(withMsg(`/admin/shows/${id}`, 'Layout saved.'));
      }
      if (action === 'reset' && post) {
        if (need('edit')) return need('edit');
        await db.applyTemplate(env.DB, id, actor);
        return redirect(withMsg(`/admin/shows/${id}`, 'Default layout applied.'));
      }
      if (action === 'delete' && post) {
        if (need('edit')) return need('edit');
        await db.deleteShow(env.DB, id, actor);
        return redirect(withMsg('/admin', 'Show deleted.'));
      }
      if (action === 'runsheet') return page(`Run sheet ${show.air_date}`, adm.runSheet({ show, settings }), 'layout');
      if (action === 'send') {
        if (need('send')) return need('send');
        const changes = await diffSinceSent(env, show);
        const built = buildScheduleEmails(settings, show, changes);
        if (!post) {
          const a = adm.analyzeShow(show, settings);
          const problems = [];
          if (a.unconfirmed.length) problems.push(`Not confirmed yet: ${a.unconfirmed.map((s) => s.content.public_name).join(', ')}`);
          const open = a.contentSlots.filter((s) => !s.content);
          if (open.length) problems.push(`${open.length} open slot${open.length > 1 ? 's' : ''}: ${open.map((s) => s.label).join(', ')}`);
          if (a.total !== 120) problems.push(`The layout runs ${a.total} minutes, not 120.`);
          if (built.missing.length) problems.push(`No email on file for: ${built.missing.join(', ')}`);
          return page('Send schedule', adm.sendPreview({ show, settings, ...built, changes, problems }), 'layout');
        }
        const recipients = emailList(settings.alert_email);
        if (!recipients.length) return redirect(withMsg(`/admin/shows/${id}/send`, "Error: add a notification email in Settings first."));
        const results = [];
        for (const to of recipients) {
          results.push(await mail.sendEmail(env, settings, { kind: 'schedule_forward', to, show_id: id, actor, ...built.forward }));
          results.push(await mail.sendEmail(env, settings, { kind: 'schedule_owner', to, show_id: id, actor, ...built.owner }));
        }
        await db.markSent(env.DB, id, db.snapshotOf(show), actor);
        const how = results.every((r) => r === 'sent') ? `Sent to ${recipients.join(', ')}.` : results.includes('failed') ? 'Error: sending failed. See the Email log.' : 'Saved to the Email log (admin email is switched off in Settings).';
        return redirect(withMsg(`/admin/shows/${id}`, `${built.update ? 'Updated schedule' : 'Final schedule'}: ${how}`));
      }
    }

    if (path === '/admin/past') {
      const shows = await db.listShows(env.DB, { status: 'aired', order: 'DESC', limit: 100 });
      return page('Past shows', adm.pastList({ shows }), 'past');
    }

    /* ---- Inbox & content ---- */
    if (path === '/admin/inbox') {
      const tab = adm.INBOX_TABS.find((t) => t[0] === url.searchParams.get('tab')) || adm.INBOX_TABS[0];
      const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
      const items = await db.listContent(env.DB, { stages: q ? null : tab[2], q });
      return page('Inbox', adm.inboxList({ items, tab: q ? 'all' : tab[0], counts, q, perm, flash, today }), 'inbox');
    }
    if (path === '/admin/content/new') {
      if (need('edit')) return need('edit');
      return page('Add content', adm.contentNew({ flash }), 'inbox');
    }
    if (path === '/admin/content' && post) {
      if (need('edit')) return need('edit');
      try {
        const f = parseContentForm(await request.formData());
        const id = await db.createContent(env.DB, f, { source: 'admin', stage: 'approved', actor, consent: 1 });
        await db.audit(env.DB, actor, 'content.create', 'content', id, f.title);
        return redirect(withMsg(`/admin/content/${id}`, 'Added and approved. Schedule it below or from a show layout.'));
      } catch (e) {
        return redirect(withMsg('/admin/content/new', e.message));
      }
    }
    if ((m = path.match(/^\/admin\/content\/(\d+)(?:\/(stage|place))?$/))) {
      const id = Number(m[1]), action = m[2] || '';
      const c = await db.getContent(env.DB, id);
      if (!c) return redirect(withMsg('/admin/inbox', 'Error: that item no longer exists.'));
      if (!action && !post) {
        const openSlots = await db.openSlots(env.DB, today);
        return page(c.public_name || c.title, adm.contentDetail({ c, perm, flash, openSlots }), 'inbox');
      }
      if (need('edit')) return need('edit');
      const form = await request.formData();
      if (!action) {
        try { await db.updateContent(env.DB, id, parseContentForm(form), actor); } catch (e) { return redirect(withMsg(`/admin/content/${id}`, e.message)); }
        return redirect(withMsg(`/admin/content/${id}`, 'Saved.'));
      }
      if (action === 'stage') {
        const to = str(form, 'stage');
        if (!['reviewing', 'approved', 'hold', 'declined', 'withdrawn', 'new'].includes(to)) return redirect(withMsg(`/admin/content/${id}`, 'Error: unknown status.'));
        await db.setStage(env.DB, id, to, str(form, 'note', 1000), actor);
        await db.audit(env.DB, actor, `content.${to}`, 'content', id);
        return redirect(withMsg(`/admin/content/${id}`, `Marked ${to === 'hold' ? 'on hold' : to}.`));
      }
      if (action === 'place') {
        const slotId = parseInt(str(form, 'slot_id'), 10);
        if (!['approved', 'scheduled'].includes(c.stage)) await db.setStage(env.DB, id, 'approved', 'Approved while scheduling', actor, true);
        try {
          const showId = await db.placeContent(env.DB, id, slotId, actor);
          return redirect(withMsg(`/admin/shows/${showId}`, `Scheduled "${c.public_name || c.title}".`));
        } catch (e) {
          return redirect(withMsg(`/admin/content/${id}`, `Error: ${e.message}`));
        }
      }
    }

    /* ---- Email log ---- */
    if (path === '/admin/emails') return page('Email log', adm.emailLog({ emails: await db.listEmails(env.DB), settings, hasBinding: !!env.EMAIL }), 'emails');

    /* ---- Settings (owner) ---- */
    if (path === '/admin/settings') {
      if (need('admin')) return need('admin');
      if (post) {
        const form = await request.formData();
        const updates = {};
        for (const k of adm.SETTING_KEYS) if (form.has(k)) updates[k] = String(form.getAll(k).pop()).trim().slice(0, 2000);
        if (updates.alert_email !== undefined) {
          const parts = updates.alert_email.split(/[,;\s]+/).filter(Boolean);
          const bad = parts.filter((x) => !isEmail(x));
          if (bad.length) return redirect(withMsg('/admin/settings', `Error: not a valid email address: ${bad.join(', ')}`));
          updates.alert_email = emailList(updates.alert_email).join(', ');
        }
        if (updates.show_start && !/^\d{1,2}:\d{2}$/.test(updates.show_start)) return redirect(withMsg('/admin/settings', 'Error: start time must look like 10:00.'));
        if (updates.retention_months) updates.retention_months = String(Math.max(1, Math.min(120, parseInt(updates.retention_months, 10) || 12)));
        await db.saveSettings(env.DB, updates);
        await db.audit(env.DB, actor, 'settings.save', '', null, Object.keys(updates).join(', '));
        return redirect(withMsg('/admin/settings', 'Settings saved.'));
      }
      return page('Settings', adm.settingsPage({ settings, template: await db.getTemplate(env.DB), flash, env }), 'settings');
    }
    if (path === '/admin/settings/template' && post) {
      if (need('admin')) return need('admin');
      const rows = parseRows(await request.formData(), { withContent: false });
      if (!rows.length) return redirect(withMsg('/admin/settings', 'Error: the default layout needs at least one slot.'));
      await db.saveTemplate(env.DB, rows, actor);
      return redirect(withMsg('/admin/settings', 'Default layout saved. New shows will use it.'));
    }

    /* ---- People (owner) ---- */
    if (path === '/admin/people') {
      if (need('admin')) return need('admin');
      if (post) {
        const form = await request.formData();
        const email = str(form, 'email', 254).toLowerCase();
        if (!isEmail(email)) return redirect(withMsg('/admin/people', 'Error: enter a valid email address.'));
        const role = ['owner', 'producer', 'viewer'].includes(str(form, 'role')) ? str(form, 'role') : 'viewer';
        try {
          await db.upsertUser(env.DB, { email, name: str(form, 'name', 120), role, active: str(form, 'active') !== '0' }, actor);
        } catch (e) {
          return redirect(withMsg('/admin/people', `Error: ${e.message}`));
        }
        return redirect(withMsg('/admin/people', `Saved ${email}.`));
      }
      const [users, activity] = await Promise.all([db.listUsers(env.DB), env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all()]);
      return page('People', adm.peoplePage({ users, me: user.email, flash, activity: activity.results }), 'people');
    }

    return redirect('/admin');
  } catch (err) {
    console.error(err);
    return redirect(withMsg(path.startsWith('/admin/shows/') || path.startsWith('/admin/content/') ? path : '/admin', `Error: ${err.message || 'something went wrong'}`));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(request, env, ctx, url);
      return await handlePublic(request, env, ctx, url);
    } catch (err) {
      console.error(err);
      return new Response('<!doctype html><meta charset=utf-8><title>Error</title><p style="font:16px system-ui;padding:2rem">Something went wrong. Please try again shortly.</p>', { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  },

  /** Nightly: mark aired shows and erase expired contact details (R25). */
  async scheduled(event, env, ctx) {
    const settings = await db.getSettings(env.DB);
    await db.markAired(env.DB, showClock(TZ(env)));
    const n = await db.purgeContacts(env.DB, settings.retention_months);
    if (n) await db.audit(env.DB, 'system', 'content.purge_contacts', '', null, `${n} item(s)`);
  },
};
