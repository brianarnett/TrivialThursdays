// Page shell, shared CSS and the one client script. All pages go through layout().
import { esc, safeUrl } from '../util.js';
import { ROLE_LABEL } from '../auth.js';

const CSS = `
:root{--paper:#f6f1e7;--card:#fffdf8;--ink:#1f1c18;--muted:#6b645a;--line:#e3dac9;--accent:#d9531e;--accent-ink:#fff;--soft:#fbe7dc;--music:#2f6f6a;--music-soft:#dcefed;--ok:#2e6b35;--ok-soft:#e1efdf;--warn:#8a5a00;--warn-soft:#f8ecd0;--bad:#a1261c;--bad-soft:#f7dfdb;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#15130f;--card:#1e1b16;--ink:#f1ece2;--muted:#a79f92;--line:#34302a;--accent:#f0733f;--accent-ink:#1a0d06;--soft:#3a2418;--music:#7cc7bf;--music-soft:#17302d;--ok:#8fd19a;--ok-soft:#1b2d1d;--warn:#f0c46a;--warn-soft:#33280f;--bad:#f19a90;--bad-soft:#3a1b18;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#15130f;--card:#1e1b16;--ink:#f1ece2;--muted:#a79f92;--line:#34302a;--accent:#f0733f;--accent-ink:#1a0d06;--soft:#3a2418;--music:#7cc7bf;--music-soft:#17302d;--ok:#8fd19a;--ok-soft:#1b2d1d;--warn:#f0c46a;--warn-soft:#33280f;--bad:#f19a90;--bad-soft:#3a1b18;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 "Inter",system-ui,sans-serif}
a{color:inherit;text-decoration-color:var(--accent);text-underline-offset:3px}
a:hover{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wrap{max-width:980px;margin:0 auto;padding-inline:16px}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;gap:8px 16px;justify-content:space-between;padding-block:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:"Fraunces",Georgia,serif;font-weight:700;font-size:1.25rem}
.brand img{width:48px;height:48px;object-fit:contain;border-radius:8px;background:#fff}
nav{display:flex;gap:6px 18px;flex-wrap:wrap;align-items:center}
nav a{text-decoration:none;font-weight:500}
nav a[aria-current]{color:var(--accent)}
.count{display:inline-block;min-width:1.4em;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-size:.72rem;font-weight:700;text-align:center;margin-left:4px;vertical-align:2px}
.who{font-size:.8rem;color:var(--muted)}
h1,h2,h3{font-family:"Fraunces",Georgia,serif;line-height:1.15;margin:0 0 .4em;text-wrap:balance}
h1{font-size:clamp(2rem,5vw,3.1rem);letter-spacing:-.01em}
h2{font-size:1.6rem}h3{font-size:1.2rem}
.hero{padding:48px 0 32px}
.hero p.lede{font-size:1.2rem;max-width:40em;color:var(--muted);margin:0 0 20px}
.airtime{display:inline-block;font-weight:600;margin-bottom:18px}
.btns{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.btn,button{display:inline-block;white-space:nowrap;font:inherit;font-weight:600;padding:9px 18px;border-radius:999px;border:1.5px solid var(--ink);background:transparent;color:var(--ink);text-decoration:none;cursor:pointer;line-height:1.3}
.btn.primary,button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.small,button.small{padding:4px 12px;font-size:.85rem}
button.danger,.btn.danger{border-color:var(--bad);color:var(--bad)}
button.icon{padding:2px 9px;border-color:var(--line);font-size:.9rem}
.btn:hover,button:hover{opacity:.88;color:var(--ink)}.btn.primary:hover,button.primary:hover{color:var(--accent-ink)}
.onair{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:var(--accent-ink);padding:4px 12px;border-radius:999px;font-weight:700;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}
.onair::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;animation:pulse 1.4s infinite}
@keyframes pulse{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.onair::before{animation:none}}
section{padding:24px 0}
.next{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--accent);border-radius:14px;padding:22px 24px}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;font-weight:700;color:var(--accent);margin:0 0 6px}
.eps{list-style:none;margin:0;padding:0}
.ep{display:grid;grid-template-columns:84px 1fr;gap:18px;padding:16px 0;border-bottom:1px solid var(--line)}
.ep:last-child{border-bottom:0}
.ep>div{min-width:0}
.ep.past{opacity:.6}
.date{font-family:"Fraunces",Georgia,serif;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 4px;line-height:1.1;height:max-content}
.date .d{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.date .md{display:block;font-size:1.15rem;font-weight:700;white-space:nowrap}
.segs{list-style:none;margin:0;padding:0}
.segs li{margin:0 0 4px}
.note{color:var(--muted);font-style:italic}
.tag{display:inline-block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:1px 8px;border-radius:999px;margin-right:6px;vertical-align:2px;background:var(--soft);color:var(--accent);white-space:nowrap}
.tag.music{background:var(--music-soft);color:var(--music)}
.tag.ok{background:var(--ok-soft);color:var(--ok)}.tag.warn{background:var(--warn-soft);color:var(--warn)}.tag.bad{background:var(--bad-soft);color:var(--bad)}.tag.plain{background:transparent;border:1px solid var(--line);color:var(--muted)}
.tba{color:var(--muted);font-style:italic}
.ep-title{font-weight:700;margin-bottom:4px}
.season-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.season-nav a{padding:4px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:.9rem}
.season-nav a[aria-current]{background:var(--ink);color:var(--paper)}
footer{border-top:1px solid var(--line);margin-top:40px;padding-block:24px;color:var(--muted);font-size:.9rem}
footer .links{display:flex;gap:6px 16px;flex-wrap:wrap}
.muted{color:var(--muted)}.small{font-size:.88rem}
.flash{background:var(--soft);border-radius:10px;padding:10px 14px;margin:0 0 16px}
.flash.bad{background:var(--bad-soft);color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.stack>*+*{margin-top:12px}
/* forms */
form.fields label,.fields label{display:block;font-weight:600;margin:14px 0 4px;font-size:.9rem}
.fields .hint{font-weight:400;color:var(--muted);font-size:.85rem}
input,select,textarea{font:inherit;font-size:.95rem;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);width:100%;min-width:0}
input[type=checkbox]{width:auto}
textarea{min-height:90px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
/* admin */
.admin .wrap{max-width:1180px}
.pagehead{display:flex;gap:12px 20px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}
.pagehead h1{margin:0;font-size:clamp(1.8rem,4vw,2.4rem)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
.tabs a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:.9rem;white-space:nowrap}
.tabs a[aria-current]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:.92rem}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;white-space:nowrap}
tr:last-child td{border-bottom:0}
td.nowrap,.nowrap{white-space:nowrap}
.num{font-variant-numeric:tabular-nums}
.showrow{display:grid;grid-template-columns:84px 1fr auto;gap:16px;padding:16px 0;border-bottom:1px solid var(--line);align-items:start}
.showrow>div{min-width:0}
.meter{display:inline-flex;gap:3px;vertical-align:middle;margin-right:6px}
.meter i{width:14px;height:8px;border-radius:2px;background:var(--line)}
.meter i.on{background:var(--ok)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.lineup{margin:6px 0 0;padding:0;list-style:none;font-size:.92rem}
.lineup li{display:grid;grid-template-columns:70px 1fr;gap:10px}
.lineup .t{color:var(--muted);font-variant-numeric:tabular-nums}
/* layout editor */
.slots{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow-x:auto}
.slot{display:grid;grid-template-columns:58px 64px 150px minmax(140px,1fr) minmax(220px,1.7fr) 136px 96px auto;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);min-width:1080px}
.slot.head{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;padding-block:8px}
.slot .t{font-variant-numeric:tabular-nums;font-weight:700}
.slot .notes{grid-column:3 / -1}
.slot.kind-break,.slot.kind-program{background:color-mix(in srgb,var(--paper) 55%,var(--card))}
.slot .rowbtns{display:flex;gap:4px}
.slot input,.slot select{padding:6px 8px;font-size:.88rem}
.total{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
.side{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:20px;align-items:start}
@media (max-width:860px){.side{grid-template-columns:1fr}}
.kv{display:grid;grid-template-columns:130px 1fr;gap:4px 12px;font-size:.93rem}
.kv dt{color:var(--muted)}.kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.hist{list-style:none;padding:0;margin:0;font-size:.9rem}
.hist li{padding:6px 0;border-bottom:1px solid var(--line)}
pre.mail{white-space:pre-wrap;font:.85rem/1.5 ui-monospace,Menlo,Consolas,monospace;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px;margin:8px 0 0;overflow-x:auto}
details>summary{cursor:pointer}
.recip{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}
.recip>div{min-width:0}
@media (max-width:640px){.ep,.showrow{grid-template-columns:64px 1fr;gap:12px}.showrow>.acts{grid-column:1 / -1}.date .md{font-size:1rem}.kv{grid-template-columns:1fr}}
@media print{header.site,footer,.noprint{display:none!important}body{background:#fff;color:#000;font-size:12pt}.card{border:0;padding:0}}
`;

const SCRIPT = `
(() => {
  document.querySelectorAll('img[data-hide-broken]').forEach((img) => {
    const hide = () => img.remove();
    if (img.complete && img.naturalWidth === 0) hide(); else img.addEventListener('error', hide);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target, msg = f.getAttribute('data-confirm');
    if (msg && !confirm(msg)) e.preventDefault();
  });
  document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
  const two = (n) => String(n).padStart(2, '0');
  const clock = (m) => { const h = Math.floor(m / 60), mm = m % 60; return ((h + 11) % 12 + 1) + ':' + two(mm); };
  document.querySelectorAll('[data-rows]').forEach((box) => {
    const start = Number(box.dataset.start || 600), target = Number(box.dataset.target || 0);
    const list = box.querySelector('[data-list]'), tpl = box.querySelector('template');
    const total = box.querySelector('[data-total]');
    const recalc = () => {
      let t = start;
      list.querySelectorAll('[data-row]').forEach((r) => {
        const cell = r.querySelector('[data-time]'); if (cell) cell.textContent = clock(t);
        const d = Number(r.querySelector('[name=duration_min]')?.value || 0); t += d;
        const kind = r.querySelector('[name=slot_type]')?.value; if (kind) r.className = r.className.replace(/kind-\\w+/, '') + ' kind-' + kind;
      });
      if (total) {
        const used = t - start;
        total.textContent = used + ' of ' + target + ' minutes' + (target && used !== target ? (used > target ? ' (over by ' + (used - target) + ')' : ' (' + (target - used) + ' unfilled)') : '');
        total.className = 'tag ' + (target && used !== target ? 'warn' : 'ok');
      }
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      e.preventDefault();
      const row = b.closest('[data-row]');
      if (b.dataset.act === 'up' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (b.dataset.act === 'down' && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      if (b.dataset.act === 'del') row.remove();
      if (b.dataset.act === 'add') list.append(tpl.content.cloneNode(true));
      recalc();
    });
    box.addEventListener('input', recalc); box.addEventListener('change', recalc); recalc();
  });
})();
`;

export function newNonce() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

export function csp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    'frame-src https://challenges.cloudflare.com',
    "connect-src 'self' https://challenges.cloudflare.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

const navLink = (href, label, key, current, extra = '') => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}${extra}</a>`;

export function layout({ title, settings, body, current = '', admin = null, nonce, head = '', bare = false }) {
  const s = settings || {};
  const pageTitle = title ? `${title} · Trivial Thursdays on WRFL` : 'Trivial Thursdays on WRFL';
  const logo = safeUrl(s.logo_url);
  let nav;
  if (admin) {
    const { user, counts = {} } = admin;
    const isOwner = user.role === 'owner';
    nav = `${navLink('/admin', 'Show Layout', 'layout', current)}${navLink('/admin/inbox', 'Inbox', 'inbox', current, counts.new ? `<span class="count">${counts.new}</span>` : '')}${navLink('/admin/past', 'Past shows', 'past', current)}${navLink('/admin/emails', 'Email log', 'emails', current)}${isOwner ? navLink('/admin/settings', 'Settings', 'settings', current) + navLink('/admin/people', 'People', 'people', current) : ''}<a href="/">View site ↗</a><span class="who">${esc(user.email)} · ${ROLE_LABEL[user.role]}</span>`;
  } else {
    nav = `${navLink('/', 'Home', 'home', current)}${navLink('/schedule', 'Schedule', 'schedule', current)}${navLink('/suggest', 'Suggest a guest', 'suggest', current)}${safeUrl(s.station_url) ? `<a href="${esc(s.station_url)}">Listen live ↗</a>` : ''}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(pageTitle)}</title>
${admin ? '<meta name="robots" content="noindex">' : `<meta name="description" content="${esc(s.tagline || '')}"><meta property="og:title" content="${esc(pageTitle)}"><meta property="og:description" content="${esc(s.tagline || '')}">${logo ? `<meta property="og:image" content="${esc(logo)}">` : ''}`}
${logo ? `<link rel="icon" href="${esc(logo)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${admin ? '' : '<link rel="alternate" type="text/calendar" title="Trivial Thursdays schedule" href="/calendar.ics">'}
<style>${CSS}</style>${head}</head><body class="${admin ? 'admin' : ''}">
${bare ? '' : `<header class="site"><div class="wrap">
<a class="brand" href="${admin ? '/admin' : '/'}">${logo ? `<img src="${esc(logo)}" alt="" data-hide-broken>` : ''}<span>Trivial Thursdays${admin ? ' <span class="muted small">Admin</span>' : ''}</span></a>
<nav>${nav}</nav></div></header>`}
<main>${body}</main>
${bare || admin ? '' : `<footer><div class="wrap">
<p>Trivial Thursdays on ${esc(s.station_name || 'WRFL')} · ${esc(s.airtime || '')}${s.host_name ? ` · Hosted by ${esc(s.host_name)}` : ''}</p>
<p class="links"><a href="/suggest">Suggest a guest or event</a><a href="/calendar.ics">Add schedule to your calendar</a><a href="/api/episodes">Schedule data (JSON)</a></p>
</div></footer>`}
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
