// Trivial Thursdays on WRFL — Cloudflare Worker entry point.
import { verifyAccess } from './auth.js';
import * as db from './db.js';
import * as v from './views.js';

const html = (body, status = 200, extra = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      ...extra,
    },
  });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  });
const redirect = (to) => new Response(null, { status: 303, headers: { location: to } });

/** Current date/time parts in the show's time zone. */
function showClock(tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

const nextThursdayAfter = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((4 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
};

function parseEpisodeForm(form) {
  const kinds = form.getAll('seg_kind');
  const names = form.getAll('seg_name');
  const urls = form.getAll('seg_url');
  const notes = form.getAll('seg_note');
  const segments = names
    .map((name, i) => ({
      kind: ['guest', 'music', 'feature'].includes(kinds[i]) ? kinds[i] : 'guest',
      name: String(name).trim(),
      url: /^https?:\/\//i.test(String(urls[i] || '').trim()) ? String(urls[i]).trim() : '',
      note: String(notes[i] || '').trim(),
    }))
    .filter((s) => s.name);
  const air_date = String(form.get('air_date') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(air_date)) throw new Error('Air date is required.');
  return {
    air_date,
    season: String(form.get('season') || '').trim(),
    title: String(form.get('title') || '').trim(),
    notes: String(form.get('notes') || '').trim(),
    published: form.get('published') === '1',
    segments,
  };
}

function toIcs(episodes, settings) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trivial Thursdays//Schedule//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Trivial Thursdays on WRFL', 'X-WR-TIMEZONE:America/New_York',
    'BEGIN:VTIMEZONE', 'TZID:America/New_York',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const e of episodes) {
    const d = e.air_date.replace(/-/g, '');
    const lineup = e.segments.map((s) => (s.kind === 'music' ? `Musical guest: ${s.name}` : s.name)).join('\n') || 'Lineup to be announced';
    lines.push(
      'BEGIN:VEVENT', `UID:tt-${e.air_date}@trivialthursdays.com`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/New_York:${d}T100000`, `DTEND;TZID=America/New_York:${d}T120000`,
      `SUMMARY:${esc(e.title || 'Trivial Thursdays on WRFL')}`, `DESCRIPTION:${esc(lineup)}`,
      `LOCATION:${esc(settings.station_name || 'WRFL-FM 88.1')}`, settings.station_url ? `URL:${settings.station_url}` : '', 'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

async function handleAdmin(request, env, url) {
  const auth = await verifyAccess(request, env);
  if (auth.error) return html(`<!doctype html><meta charset=utf-8><title>Admin</title><p style="font:16px system-ui;padding:2rem">${v.esc(auth.error)}</p>`, 403);

  if (request.method === 'POST') {
    // Same-origin check as CSRF defence for form posts.
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return new Response('Bad origin', { status: 403 });
  }

  const settings = await db.getSettings(env.DB);
  const { today } = showClock(env.SHOW_TZ || 'America/New_York');
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const flash = url.searchParams.get('msg') || '';
  const page = (title, body, current) => html(v.layout({ title, settings, body, current, admin: true }), 200, { 'cache-control': 'no-store' });

  if (path === '/admin' && request.method === 'GET') {
    const episodes = await db.listEpisodes(env.DB, { includeUnpublished: true });
    episodes.reverse();
    return page('Admin', v.adminList({ episodes, user: auth.email, flash, today }), 'admin');
  }

  if (path === '/admin/settings') {
    if (request.method === 'POST') {
      const form = await request.formData();
      const updates = v.SETTING_KEYS.filter((k) => form.has(k)).map((k) => [k, String(form.get(k)).trim()]);
      await db.saveSettings(env.DB, Object.fromEntries(updates));
      return redirect('/admin/settings?msg=Settings saved.');
    }
    return page('Settings', v.adminSettings({ settings, flash }), 'settings');
  }

  if (path === '/admin/episodes/new') {
    const last = await env.DB.prepare('SELECT MAX(air_date) AS d FROM episodes').first();
    const air_date = last?.d ? nextThursdayAfter(last.d) : nextThursdayAfter(today);
    return page('New episode', v.adminEdit({ ep: null, defaults: { air_date, season: settings.current_season || '' } }), 'admin');
  }

  if (path === '/admin/episodes' && request.method === 'POST') {
    try {
      await db.saveEpisode(env.DB, parseEpisodeForm(await request.formData()));
      return redirect('/admin?msg=Episode created.');
    } catch (e) {
      return redirect(`/admin?msg=${encodeURIComponent(/UNIQUE/.test(e.message) ? 'An episode already exists on that date.' : e.message)}`);
    }
  }

  const m = path.match(/^\/admin\/episodes\/(\d+)(\/delete)?$/);
  if (m) {
    const id = Number(m[1]);
    if (m[2] && request.method === 'POST') {
      await db.deleteEpisode(env.DB, id);
      return redirect('/admin?msg=Episode deleted.');
    }
    if (request.method === 'POST') {
      try {
        await db.saveEpisode(env.DB, parseEpisodeForm(await request.formData()), id);
        return redirect('/admin?msg=Episode saved.');
      } catch (e) {
        return redirect(`/admin?msg=${encodeURIComponent(/UNIQUE/.test(e.message) ? 'An episode already exists on that date.' : e.message)}`);
      }
    }
    const ep = await db.getEpisode(env.DB, id);
    if (!ep) return redirect('/admin?msg=Episode not found.');
    return page('Edit episode', v.adminEdit({ ep }), 'admin');
  }

  return redirect('/admin');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/admin' || path.startsWith('/admin/')) return await handleAdmin(request, env, url);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

      const tz = env.SHOW_TZ || 'America/New_York';
      const { today, hour, weekday } = showClock(tz);
      const settings = await db.getSettings(env.DB);
      const cache = { 'cache-control': 'public, max-age=120' };

      if (path === '/healthz') return json({ ok: true, today });

      if (path === '/') {
        const upcomingAll = await db.listEpisodes(env.DB, { from: today });
        const [next, ...rest] = upcomingAll;
        const onAir = !!next && next.air_date === today && weekday === 'Thu' && hour >= 10 && hour < 12;
        const body = v.homePage({ settings, next, upcoming: rest.slice(0, 6), today, onAir });
        return html(v.layout({ settings, body, current: 'home' }), 200, cache);
      }

      if (path === '/schedule' || path === '/schedule/') {
        const seasons = await db.listSeasons(env.DB);
        const season = url.searchParams.get('season') || settings.current_season || seasons[0] || '';
        const episodes = await db.listEpisodes(env.DB, season ? { season } : {});
        const body = v.schedulePage({ season, seasons, episodes, today });
        return html(v.layout({ title: `${season} guest schedule`, settings, body, current: 'schedule' }), 200, cache);
      }

      if (path === '/api/episodes') {
        const season = url.searchParams.get('season') || undefined;
        const from = url.searchParams.get('from') || undefined;
        const episodes = await db.listEpisodes(env.DB, { season, from });
        return json({
          show: { name: 'Trivial Thursdays on WRFL', airtime: settings.airtime, station: settings.station_name, timezone: tz },
          episodes: episodes.map(({ air_date, season, title, notes, segments }) => ({
            air_date, season, title, notes,
            segments: segments.map(({ kind, name, url, note }) => ({ kind, name, url, note })),
          })),
        });
      }

      if (path === '/calendar.ics') {
        const episodes = await db.listEpisodes(env.DB);
        return new Response(toIcs(episodes, settings), {
          headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="trivial-thursdays.ics"', ...cache },
        });
      }

      // Old Blogger URL for the schedule page → new schedule page.
      if (path === '/p/trivial-thursdays-on-wrfl-guest-schedule.html') return Response.redirect(`${url.origin}/schedule`, 301);

      return html(v.layout({ title: 'Not found', settings, body: v.notFoundPage() }), 404);
    } catch (err) {
      console.error(err);
      return html('<!doctype html><meta charset=utf-8><title>Error</title><p style="font:16px system-ui;padding:2rem">Something went wrong. Please try again shortly.</p>', 500);
    }
  },
};
