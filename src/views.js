// HTML rendering. Plain template strings — no build step, easy to change later.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

const fmt = (date, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));
export const longDate = (d) => fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const monthDay = (d) => fmt(d, { month: 'short', day: 'numeric' });
const dow = (d) => fmt(d, { weekday: 'short' });

const CSS = `
:root{--paper:#f6f1e7;--card:#fffdf8;--ink:#1f1c18;--muted:#6b645a;--line:#e3dac9;--accent:#d9531e;--accent-ink:#fff;--soft:#fbe7dc;--music:#2f6f6a;--music-soft:#dcefed}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#15130f;--card:#1e1b16;--ink:#f1ece2;--muted:#a79f92;--line:#34302a;--accent:#f0733f;--accent-ink:#1a0d06;--soft:#3a2418;--music:#7cc7bf;--music-soft:#17302d}}
:root[data-theme="dark"]{--paper:#15130f;--card:#1e1b16;--ink:#f1ece2;--muted:#a79f92;--line:#34302a;--accent:#f0733f;--accent-ink:#1a0d06;--soft:#3a2418;--music:#7cc7bf;--music-soft:#17302d}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 "Inter",system-ui,sans-serif}
a{color:inherit;text-decoration-color:var(--accent);text-underline-offset:3px}
a:hover{color:var(--accent)}
.wrap{max-width:980px;margin:0 auto;padding:0 16px}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;gap:16px;justify-content:space-between;padding-block:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:"Fraunces",Georgia,serif;font-weight:700;font-size:1.25rem}
.brand img{width:48px;height:48px;object-fit:contain;border-radius:8px;background:#fff}
nav a{margin-left:18px;text-decoration:none;font-weight:500}
nav a[aria-current]{color:var(--accent)}
h1,h2,h3{font-family:"Fraunces",Georgia,serif;line-height:1.15;margin:0 0 .4em}
h1{font-size:clamp(2rem,5vw,3.1rem);letter-spacing:-.01em}
h2{font-size:1.6rem}
.hero{padding:48px 0 32px}
.hero p.lede{font-size:1.2rem;max-width:40em;color:var(--muted);margin:0 0 20px}
.airtime{display:inline-block;font-weight:600;margin-bottom:18px}
.btns{display:flex;gap:10px;flex-wrap:wrap}
.btn{display:inline-block;white-space:nowrap;padding:10px 18px;border-radius:999px;border:1.5px solid var(--ink);text-decoration:none;font-weight:600}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn:hover{opacity:.9;color:inherit}.btn.primary:hover{color:var(--accent-ink)}
.onair{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:var(--accent-ink);padding:4px 12px;border-radius:999px;font-weight:700;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}
.onair::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;animation:pulse 1.4s infinite}
@keyframes pulse{50%{opacity:.25}}
section{padding:24px 0}
.next{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--accent);border-radius:14px;padding:22px 24px}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;font-weight:700;color:var(--accent)}
.eps{list-style:none;margin:0;padding:0}
.ep{display:grid;grid-template-columns:84px 1fr;gap:18px;padding:16px 0;border-bottom:1px solid var(--line)}
.ep:last-child{border-bottom:0}
.ep.past{opacity:.6}
.date{font-family:"Fraunces",Georgia,serif;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 4px;line-height:1.1;height:max-content}
.date .d{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.date .md{display:block;font-size:1.15rem;font-weight:700;white-space:nowrap}
.segs{list-style:none;margin:0;padding:0}
.segs li{margin:0 0 4px}
.segs .note{color:var(--muted);font-style:italic}
.tag{display:inline-block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:1px 8px;border-radius:999px;margin-right:6px;vertical-align:2px}
.tag.music{background:var(--music-soft);color:var(--music)}
.tag.feature{background:var(--soft);color:var(--accent)}
.tba{color:var(--muted);font-style:italic}
.ep-title{font-weight:700;margin-bottom:4px}
.season-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.season-nav a{padding:4px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:.9rem}
.season-nav a[aria-current]{background:var(--ink);color:var(--paper)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:24px 0;color:var(--muted);font-size:.9rem}
footer a{margin-right:14px}
/* admin */
.admin table{width:100%;border-collapse:collapse;font-size:.95rem}
.admin th,.admin td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
.admin .wrap{max-width:1100px}
.admin td:first-child{white-space:nowrap}
form.stack label{display:block;font-weight:600;margin:14px 0 4px;font-size:.9rem}
input,select,textarea{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);width:100%}
textarea{min-height:80px}
.segrow{display:grid;grid-template-columns:120px 1.4fr 1fr .8fr;gap:8px;margin-bottom:8px}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1;min-width:160px}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:999px;border:0;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button.ghost{background:transparent;border:1.5px solid var(--line);color:var(--ink)}
button.danger{background:transparent;border:1.5px solid #b3261e;color:#b3261e}
.flash{background:var(--soft);border-radius:10px;padding:10px 14px;margin:16px 0}
.muted{color:var(--muted)}
@media (max-width:640px){.ep{grid-template-columns:64px 1fr;gap:12px}.date .md{font-size:1rem}nav a{margin-left:12px}.segrow{grid-template-columns:1fr 1fr}}
`;

export function layout({ title, settings, body, current = '', admin = false }) {
  const s = settings || {};
  const pageTitle = title ? `${title} · Trivial Thursdays on WRFL` : 'Trivial Thursdays on WRFL';
  const logo = safeUrl(s.logo_url);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(s.tagline || '')}">
<meta property="og:title" content="${esc(pageTitle)}"><meta property="og:description" content="${esc(s.tagline || '')}">${logo ? `<meta property="og:image" content="${esc(logo)}">` : ''}
${logo ? `<link rel="icon" href="${esc(logo)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="alternate" type="text/calendar" title="Trivial Thursdays schedule" href="/calendar.ics">
<style>${CSS}</style></head><body class="${admin ? 'admin' : ''}">
<header class="site"><div class="wrap">
<a class="brand" href="/">${logo ? `<img src="${esc(logo)}" alt="" onerror="this.remove()">` : ''}<span>Trivial Thursdays</span></a>
<nav>${admin
    ? `<a href="/admin"${current === 'admin' ? ' aria-current="page"' : ''}>Episodes</a><a href="/admin/settings"${current === 'settings' ? ' aria-current="page"' : ''}>Settings</a><a href="/">View site ↗</a>`
    : `<a href="/"${current === 'home' ? ' aria-current="page"' : ''}>Home</a><a href="/schedule"${current === 'schedule' ? ' aria-current="page"' : ''}>Schedule</a>${safeUrl(s.station_url) ? `<a href="${esc(s.station_url)}">Listen live ↗</a>` : ''}`}
</nav></div></header>
<main>${body}</main>
<footer><div class="wrap">
${admin ? '' : `<p>Trivial Thursdays on ${esc(s.station_name || 'WRFL')} · ${esc(s.airtime || '')}${s.host_name ? ` · Hosted by ${esc(s.host_name)}` : ''}</p>
<p><a href="/calendar.ics">Add schedule to your calendar</a><a href="/api/episodes">Schedule data (JSON)</a></p>`}
</div></footer></body></html>`;
}

export function segmentsHtml(ep) {
  if (!ep.segments.length) return `<p class="tba">Lineup to be announced</p>`;
  return `<ul class="segs">${ep.segments
    .map((s) => {
      const url = safeUrl(s.url);
      const name = url ? `<a href="${esc(url)}" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
      const tag = s.kind === 'music' ? '<span class="tag music">Musical guest</span>' : s.kind === 'feature' ? '<span class="tag feature">Special</span>' : '';
      const note = s.note ? ` <span class="note">(${esc(s.note)})</span>` : '';
      return `<li>${tag}${name}${note}</li>`;
    })
    .join('')}</ul>`;
}

export function episodeItem(ep, today) {
  const past = ep.air_date < today;
  return `<li class="ep${past ? ' past' : ''}" id="d${esc(ep.air_date)}">
<div class="date"><span class="d">${dow(ep.air_date)}</span><span class="md">${monthDay(ep.air_date)}</span></div>
<div>${ep.title ? `<div class="ep-title">${esc(ep.title)}</div>` : ''}${segmentsHtml(ep)}${ep.notes ? `<p class="muted">${esc(ep.notes)}</p>` : ''}</div></li>`;
}

export function homePage({ settings, next, upcoming, today, onAir }) {
  const s = settings;
  const listen = safeUrl(s.station_url);
  const fb = safeUrl(s.facebook_url);
  const nextBlock = next
    ? `<section><div class="next">
<div class="eyebrow">${onAir ? '<span class="onair">On air now</span>' : next.air_date === today ? 'Today' : 'Next show'}</div>
<h2>${esc(longDate(next.air_date))}</h2>${next.title ? `<div class="ep-title">${esc(next.title)}</div>` : ''}
${segmentsHtml(next)}</div></section>`
    : '';
  return `<div class="wrap">
<section class="hero">
<p class="eyebrow">Hello, radio friends!</p>
<h1>Trivial Thursdays on ${esc(s.station_name || 'WRFL')}</h1>
<p class="lede">${esc(s.tagline || '')}</p>
<div class="airtime">${esc(s.airtime || '')}</div>
<div class="btns">${listen ? `<a class="btn primary" href="${esc(listen)}">Listen on WRFL</a>` : ''}${fb ? `<a class="btn" href="${esc(fb)}">Watch on Facebook Live</a>` : ''}</div>
</section>
${nextBlock}
<section><h2>Coming up</h2>
${upcoming.length ? `<ul class="eps">${upcoming.map((e) => episodeItem(e, today)).join('')}</ul>` : '<p class="tba">More shows coming soon.</p>'}
<p><a href="/schedule">Full season schedule →</a></p></section>
</div>`;
}

export function schedulePage({ season, seasons, episodes, today }) {
  return `<div class="wrap"><section>
<p class="eyebrow">Guest schedule</p><h1>${esc(season || 'Schedule')}</h1>
${seasons.length > 1 ? `<div class="season-nav">${seasons.map((x) => `<a href="/schedule?season=${encodeURIComponent(x)}"${x === season ? ' aria-current="true"' : ''}>${esc(x)}</a>`).join('')}</div>` : ''}
${episodes.length ? `<ul class="eps">${episodes.map((e) => episodeItem(e, today)).join('')}</ul>` : '<p class="tba">No shows listed yet.</p>'}
</section></div>`;
}

export function notFoundPage() {
  return `<div class="wrap"><section class="hero"><h1>Dead air.</h1><p class="lede">That page isn't on the schedule. <a href="/">Head back home</a>.</p></section></div>`;
}

/* ---------- admin ---------- */

export function adminList({ episodes, user, flash, today }) {
  return `<div class="wrap"><section>
<div class="row" style="align-items:center"><h1 style="flex:3">Episodes</h1><div style="text-align:right"><a class="btn primary" href="/admin/episodes/new">+ New episode</a></div></div>
<p class="muted">Signed in as ${esc(user)}</p>${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<table><thead><tr><th>Date</th><th>Season</th><th>Lineup</th><th>Status</th><th></th></tr></thead><tbody>
${episodes
    .map(
      (e) => `<tr${e.air_date < today ? ' class="muted"' : ''}><td>${esc(e.air_date)}</td><td>${esc(e.season)}</td>
<td>${e.title ? `<strong>${esc(e.title)}</strong><br>` : ''}${e.segments.length ? e.segments.map((s) => esc(s.name)).join(' + ') : '<em>TBA</em>'}</td>
<td>${e.published ? 'Published' : 'Draft'}</td><td><a href="/admin/episodes/${e.id}">Edit</a></td></tr>`
    )
    .join('')}
</tbody></table></section></div>`;
}

const KINDS = [['guest', 'Guest'], ['music', 'Musical guest'], ['feature', 'Special']];

function segRow(s = {}) {
  return `<div class="segrow">
<select name="seg_kind">${KINDS.map(([v, l]) => `<option value="${v}"${s.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
<input name="seg_name" placeholder="Guest or segment name" value="${esc(s.name)}">
<input name="seg_url" placeholder="Link (optional)" value="${esc(s.url)}">
<input name="seg_note" placeholder="Note (optional)" value="${esc(s.note)}"></div>`;
}

export function adminEdit({ ep, defaults }) {
  const e = ep || { air_date: defaults.air_date, season: defaults.season, title: '', notes: '', published: 1, segments: [] };
  const rows = [...e.segments, {}, {}, {}].slice(0, Math.max(e.segments.length + 2, 4));
  return `<div class="wrap"><section>
<p><a href="/admin">← All episodes</a></p>
<h1>${ep ? `Edit ${esc(longDate(e.air_date))}` : 'New episode'}</h1>
<form class="stack" method="post" action="${ep ? `/admin/episodes/${ep.id}` : '/admin/episodes'}">
<div class="row"><div><label>Air date</label><input type="date" name="air_date" required value="${esc(e.air_date)}"></div>
<div><label>Season</label><input name="season" value="${esc(e.season)}" placeholder="Fall 2026"></div>
<div><label>Status</label><select name="published"><option value="1"${e.published ? ' selected' : ''}>Published</option><option value="0"${e.published ? '' : ' selected'}>Draft</option></select></div></div>
<label>Headline (optional — for special shows)</label><input name="title" value="${esc(e.title)}">
<label>Lineup <span class="muted" style="font-weight:400">— in on-air order; leave a name blank to drop that row</span></label>
<div id="segs">${rows.map(segRow).join('')}</div>
<button type="button" class="ghost" onclick="const r=document.querySelector('#segs .segrow').cloneNode(true);r.querySelectorAll('input').forEach(i=>i.value='');document.getElementById('segs').append(r)">+ Add row</button>
<label>Notes (optional)</label><textarea name="notes">${esc(e.notes)}</textarea>
<p><button type="submit">Save episode</button></p></form>
${ep ? `<form method="post" action="/admin/episodes/${ep.id}/delete" onsubmit="return confirm('Delete this episode?')"><button class="danger" type="submit">Delete episode</button></form>` : ''}
</section></div>`;
}

const SETTING_FIELDS = [
  ['tagline', 'Tagline / intro paragraph', 'textarea'],
  ['airtime', 'Air time'],
  ['station_name', 'Station name'],
  ['station_url', 'Station / live stream link'],
  ['facebook_url', 'Facebook Live link'],
  ['host_name', 'Host'],
  ['logo_url', 'Logo image URL'],
  ['current_season', 'Current season (shown on /schedule by default)'],
];

export function adminSettings({ settings, flash }) {
  return `<div class="wrap"><section><h1>Site settings</h1>${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<form class="stack" method="post" action="/admin/settings">
${SETTING_FIELDS.map(([k, l, t]) => `<label>${l}</label>${t === 'textarea' ? `<textarea name="${k}">${esc(settings[k])}</textarea>` : `<input name="${k}" value="${esc(settings[k])}">`}`).join('')}
<p><button type="submit">Save settings</button></p></form></section></div>`;
}
export const SETTING_KEYS = SETTING_FIELDS.map((f) => f[0]);
