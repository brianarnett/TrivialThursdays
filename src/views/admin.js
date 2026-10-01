// Admin screens. `perm` = { edit, send, admin } booleans for the signed-in user.
import { emailList, esc, safeUrl, longDate, mediumDate, monthDay, dow, fmtTime, fmtClock, daysBetween, KIND_LABEL, SLOT_LABEL, STAGE_LABEL, APPEAR_LABEL, CONTENT_SLOT_TYPES, isEmail } from '../util.js';
import { ROLES, ROLE_LABEL } from '../auth.js';
import { withPrefix } from '../email.js';

const flashHtml = (flash) => (flash ? `<div class="flash${/^(error|could not|there must|the same)/i.test(flash) ? ' bad' : ''}" role="status">${esc(flash)}</div>` : '');
const stageTag = (st) => `<span class="tag ${{ new: '', reviewing: 'plain', approved: 'ok', scheduled: 'ok', aired: 'plain', declined: 'bad', hold: 'warn', withdrawn: 'plain' }[st] ?? 'plain'}">${STAGE_LABEL[st] || st}</span>`;
const statusTag = (st) => `<span class="tag ${{ planning: 'warn', ready: 'ok', aired: 'plain' }[st]}">${{ planning: 'Planning', ready: 'Ready', aired: 'Aired' }[st]}</span>`;
const fmtStamp = (ts) => (ts ? esc(String(ts).replace('T', ' ').slice(0, 16)) + ' UTC' : '');
const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
const dateBlock = (d) => `<div class="date"><span class="d">${dow(d)}</span><span class="md">${monthDay(d)}</span></div>`;

/* ---------------- show analysis (shared by list, detail, send) ---------------- */

export function analyzeShow(show, settings) {
  const contentSlots = show.slots.filter((s) => CONTENT_SLOT_TYPES.includes(s.slot_type));
  const filled = contentSlots.filter((s) => s.content);
  const total = show.slots.reduce((n, s) => n + s.duration_min, 0);
  const noEmail = filled.filter((s) => !isEmail(s.content.contact_email));
  const unconfirmed = filled.filter((s) => !s.confirmed);
  const warnings = [];
  if (total !== 120) warnings.push([`Runs ${total} min`, 'warn']);
  if (show.changed_since_sent) warnings.push(['Changed since sent', 'bad']);
  if (unconfirmed.length) warnings.push([`${unconfirmed.length} not confirmed`, 'warn']);
  if (noEmail.length) warnings.push([`${noEmail.length} without email`, 'warn']);
  return { contentSlots, filled, total, noEmail, unconfirmed, warnings };
}

function meter(n, of) {
  return `<span class="meter" aria-hidden="true">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

function miniLineup(show) {
  const rows = show.slots.filter((s) => s.content);
  if (!rows.length) return '<p class="tba small">Nothing scheduled yet</p>';
  return `<ul class="lineup">${rows.map((s) => `<li><span class="t">${fmtClock(s.start_min)}</span><span>${esc(s.content.public_name)}${s.confirmed ? '' : ' <span class="tag warn">unconfirmed</span>'}</span></li>`).join('')}</ul>`;
}

/* ---------------- Show Layout: list ---------------- */

export function layoutList({ shows, settings, perm, flash, nextDate, today }) {
  return `<div class="wrap"><section>
<div class="pagehead"><div><p class="eyebrow">Admin</p><h1>Show Layout</h1></div>
${perm.edit ? `<form method="post" action="/admin/shows" class="btns"><input type="date" name="air_date" value="${esc(nextDate)}" required style="width:auto" aria-label="Show date"><button class="primary" type="submit">+ Add show</button></form>` : ''}</div>
${flashHtml(flash)}
<p class="muted small">Upcoming shows. Open one to fill its time slots with approved content from the <a href="/admin/inbox?tab=approved">Inbox</a>. Past shows are under <a href="/admin/past">Past shows</a>.</p>
${shows.length ? shows.map((sh, i) => showRow(sh, settings, today, i === 0)).join('') : '<p class="tba">No upcoming shows. Add one above.</p>'}
</section></div>`;
}

function showRow(sh, settings, today, expanded) {
  const a = analyzeShow(sh, settings);
  const days = daysBetween(today, sh.air_date);
  const sent = sh.schedule_sent_at ? `<span class="tag ok">Schedule sent</span>` : days <= 7 ? `<span class="tag warn">Schedule not sent</span>` : '';
  return `<div class="showrow">
${dateBlock(sh.air_date)}
<div><div><a href="/admin/shows/${sh.id}"><strong>${esc(longDate(sh.air_date))}</strong></a> ${statusTag(sh.status)} ${sh.title ? `<span class="muted">· ${esc(sh.title)}</span>` : ''}</div>
<div class="small">${meter(a.filled.length, a.contentSlots.length)}${a.filled.length} of ${a.contentSlots.length} slots filled · ${a.filled.length - a.unconfirmed.length} confirmed · ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}</div>
<div class="chips">${sent}${a.warnings.map(([t, k]) => `<span class="tag ${k}">${esc(t)}</span>`).join('')}</div>
${expanded ? miniLineup(sh) : `<details class="small" style="margin-top:6px"><summary>Lineup</summary>${miniLineup(sh)}</details>`}
</div>
<div class="acts"><a class="btn small" href="/admin/shows/${sh.id}">Open layout</a></div>
</div>`;
}

/* ---------------- Show Layout: one show ---------------- */

function slotRow(sl, picker, readOnly) {
  const c = sl.content;
  if (readOnly) {
    return `<div class="slot kind-${sl.slot_type}" data-row><span class="t">${fmtClock(sl.start_min)}</span><span class="num">${sl.duration_min} min</span><span>${SLOT_LABEL[sl.slot_type]}</span><span>${esc(sl.label)}</span>
<span>${c ? `<a href="/admin/content/${c.id}">${esc(c.public_name)}</a>` : '<span class="muted">—</span>'}</span><span>${c ? (sl.confirmed ? '<span class="tag ok">Yes</span>' : '<span class="tag warn">No</span>') : ''}</span><span>${sl.public ? 'Public' : 'Hidden'}</span><span></span>
${sl.notes ? `<span class="notes small muted">Notes: ${esc(sl.notes)}</span>` : ''}</div>`;
  }
  const options = [`<option value="">— Empty —</option>`];
  if (c) options.push(`<option value="${c.id}" selected>${esc(c.public_name)} (${KIND_LABEL[c.kind]})</option>`);
  for (const [kind, items] of picker) {
    if (!items.length) continue;
    options.push(`<optgroup label="Approved: ${esc(KIND_LABEL[kind])}">${items.map((it) => `<option value="${it.id}">${esc(it.public_name || it.title)}${it.event_date ? ` · event ${esc(it.event_date)}` : ''}</option>`).join('')}</optgroup>`);
  }
  return `<div class="slot kind-${sl.slot_type || 'guest'}" data-row>
<span class="t" data-time>${sl.start_min != null ? fmtClock(sl.start_min) : ''}</span>
<input name="duration_min" type="number" min="0" max="120" step="1" value="${sl.duration_min ?? 25}" aria-label="Minutes">
<select name="slot_type" aria-label="Slot type">${Object.entries(SLOT_LABEL).map(([k, l]) => opt(k, l, sl.slot_type || 'guest')).join('')}</select>
<input name="label" value="${esc(sl.label ?? 'Guest segment')}" aria-label="Slot label">
<select name="content_id" aria-label="Content">${options.join('')}</select>
<select name="confirmed" aria-label="Confirmed">${opt('0', 'Not confirmed', sl.confirmed ? 1 : 0)}${opt('1', 'Confirmed', sl.confirmed ? 1 : 0)}</select>
<select name="public" aria-label="Show publicly">${opt('1', 'Public', sl.public ?? 1)}${opt('0', 'Hidden', sl.public ?? 1)}</select>
<span class="rowbtns"><button class="icon" data-act="up" title="Move up" aria-label="Move up">↑</button><button class="icon" data-act="down" title="Move down" aria-label="Move down">↓</button><button class="icon" data-act="del" title="Remove slot" aria-label="Remove slot">✕</button></span>
<input class="notes" name="notes" value="${esc(sl.notes ?? '')}" placeholder="Prep notes (private): questions, pronunciation, reminders" aria-label="Prep notes">
</div>`;
}

export function showDetail({ show, settings, approved, perm, flash, emails, startMin }) {
  const a = analyzeShow(show, settings);
  const readOnly = !perm.edit;
  const picker = CONTENT_SLOT_TYPES.map((k) => [k, approved.filter((it) => it.kind === k)]);
  const sentLine = show.schedule_sent_at
    ? `Schedule sent ${fmtStamp(show.schedule_sent_at)} by ${esc(show.schedule_sent_by)}${show.changed_since_sent ? ' · <strong>changed since</strong>' : ''}`
    : 'Schedule not sent yet';
  return `<div class="wrap"><section>
<p class="small"><a href="${show.status === 'aired' ? '/admin/past' : '/admin'}">← ${show.status === 'aired' ? 'Past shows' : 'Show Layout'}</a></p>
<div class="pagehead"><div><p class="eyebrow">${statusTag(show.status)} ${show.title ? esc(show.title) : ''}</p><h1>${esc(longDate(show.air_date))}</h1><p class="muted small" style="margin:6px 0 0">${sentLine}</p></div>
<div class="btns noprint"><a class="btn small" href="/admin/shows/${show.id}/runsheet">Run sheet</a>
${perm.send && show.status !== 'aired' ? `<a class="btn small primary" href="/admin/shows/${show.id}/send">${show.schedule_sent_at ? (show.changed_since_sent ? 'Send updated schedule' : 'Resend schedule') : 'Send final schedule'}</a>` : ''}</div></div>
${flashHtml(flash)}
<div class="chips" style="margin-bottom:12px">${a.warnings.map(([t, k]) => `<span class="tag ${k}">${esc(t)}</span>`).join('') || '<span class="tag ok">Layout looks complete</span>'}</div>

${readOnly
    ? `<div class="slots"><div class="slot head"><span>Time</span><span>Length</span><span>Type</span><span>Slot</span><span>Content</span><span>Confirmed</span><span>Public</span><span></span></div>${show.slots.map((s) => slotRow(s, picker, true)).join('')}</div>`
    : `<form method="post" action="/admin/shows/${show.id}/layout" data-rows data-start="${startMin}" data-target="120">
<div class="total"><span data-total class="tag">${a.total} of 120 minutes</span><span class="muted small">Times update as you change lengths or order. Choosing an item here removes it from any other show.</span></div>
<div class="slots"><div class="slot head"><span>Time</span><span>Min</span><span>Type</span><span>Slot</span><span>Content</span><span>Confirmed</span><span>Public</span><span></span></div>
<div data-list>${show.slots.map((s) => slotRow(s, picker, false)).join('')}</div></div>
<template>${slotRow({ slot_type: 'guest', label: 'Guest segment', duration_min: 15, public: 1 }, picker, false)}</template>
<div class="btns" style="margin-top:12px"><button class="small" data-act="add">+ Add slot</button><button class="primary" type="submit">Save layout</button></div>
</form>
${approved.length ? '' : `<p class="muted small">No approved content is waiting. Approve items in the <a href="/admin/inbox">Inbox</a> to fill slots.</p>`}`}

<div class="side" style="margin-top:28px">
<div>
<h3>Show details</h3>
${perm.edit ? `<form class="fields card" method="post" action="/admin/shows/${show.id}">
<div class="grid2"><div><label for="air_date">Air date</label><input id="air_date" type="date" name="air_date" value="${esc(show.air_date)}" required></div>
<div><label for="season">Season</label><input id="season" name="season" value="${esc(show.season)}"></div>
<div><label for="status">Status</label><select id="status" name="status">${opt('planning', 'Planning', show.status)}${opt('ready', 'Ready', show.status)}${opt('aired', 'Aired', show.status)}</select></div>
<div><label for="published">On public site</label><select id="published" name="published">${opt('1', 'Listed', show.published)}${opt('0', 'Hidden', show.published)}</select></div></div>
<label for="title">Headline <span class="hint">(optional, for special shows)</span></label><input id="title" name="title" value="${esc(show.title)}">
<label for="notes">Planning notes <span class="hint">(private)</span></label><textarea id="notes" name="notes">${esc(show.notes)}</textarea>
<label for="after_notes">After-show notes</label><textarea id="after_notes" name="after_notes">${esc(show.after_notes)}</textarea>
<label for="recording_url">Recording link</label><input id="recording_url" name="recording_url" type="url" value="${esc(show.recording_url)}" placeholder="https://">
<p class="btns" style="margin-top:14px"><button type="submit">Save details</button></p></form>
<div class="btns" style="margin-top:14px">
<form method="post" action="/admin/shows/${show.id}/reset" data-confirm="Replace this show's slots with the default layout? Content in it goes back to Approved."><button class="small" type="submit">Reset to default layout</button></form>
<form method="post" action="/admin/shows/${show.id}/delete" data-confirm="Delete this show? Its content goes back to Approved."><button class="small danger" type="submit">Delete show</button></form></div>`
    : `<div class="card"><dl class="kv"><dt>Season</dt><dd>${esc(show.season)}</dd><dt>Notes</dt><dd>${esc(show.notes) || '—'}</dd><dt>After-show</dt><dd>${esc(show.after_notes) || '—'}</dd><dt>Recording</dt><dd>${safeUrl(show.recording_url) ? `<a href="${esc(show.recording_url)}">Listen</a>` : '—'}</dd></dl></div>`}
</div>
<div><h3>Emails for this show</h3>${emailMiniList(emails)}</div>
</div>
</section></div>`;
}

function emailMiniList(emails) {
  if (!emails.length) return '<p class="muted small">None yet.</p>';
  return `<ul class="hist">${emails.map((e) => `<li><span class="tag ${e.status === 'sent' ? 'ok' : e.status === 'failed' ? 'bad' : 'plain'}">${e.status === 'logged' ? 'Logged only' : e.status}</span> ${esc(e.subject)}<br><span class="muted small">to ${esc(e.to_addr)} · ${fmtStamp(e.created_at)}</span>${e.error ? `<br><span class="small" style="color:var(--bad)">${esc(e.error)}</span>` : ''}</li>`).join('')}</ul>`;
}

/* ---------------- send final schedule ---------------- */

export function sendPreview({ show, settings, forward, owner, forwardTo, missing, changes, update, problems }) {
  const to = emailList(settings.alert_email).join(', ');
  const on = settings.email_admins_enabled === '1';
  return `<div class="wrap"><section style="max-width:860px">
<p class="small"><a href="/admin/shows/${show.id}">← Back to the layout</a></p>
<p class="eyebrow">${update ? 'Send updated schedule' : 'Send final schedule'}</p><h1>${esc(longDate(show.air_date))}</h1>
<p>Two emails go to <strong>${esc(to || 'no address set')}</strong> (each address gets its own copy): a schedule that's safe to forward to guests, and a private run sheet with contacts and the forwarding list.</p>
${!to ? `<div class="flash bad">Add a notification email under Settings → Notifications before sending.</div>` : ''}
${to && !on ? `<div class="flash">Admin email is switched off in Settings, so these will be saved to the Email log but not delivered.</div>` : ''}
${problems.length ? `<div class="card" style="margin-bottom:16px"><strong>Check before sending</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
${changes ? `<div class="card" style="margin-bottom:16px"><strong>Changes since the last send</strong><ul>${[...changes.added.map((c) => `Added: ${c.public_name}`), ...changes.moved.map((c) => `New time: ${c.public_name}`), ...changes.removed.map((c) => `Removed: ${c.public_name}`)].map((x) => `<li>${esc(x)}</li>`).join('') || '<li>No guest or time changes</li>'}</ul></div>` : ''}
<h3>Forward to</h3><p>${forwardTo.length ? esc(forwardTo.join(', ')) : '<span class="muted">No guest email addresses on file.</span>'}</p>
${missing.length ? `<p class="small muted">No email on file for: ${esc(missing.join(', '))}</p>` : ''}
<details open><summary><strong>Email 1: ${esc(withPrefix(settings, forward.subject))}</strong> <span class="muted small">(forwardable)</span></summary><pre class="mail">${esc(forward.text)}</pre></details>
<details style="margin-top:12px"><summary><strong>Email 2: ${esc(withPrefix(settings, owner.subject))}</strong> <span class="muted small">(private)</span></summary><pre class="mail">${esc(owner.text)}</pre></details>
<form method="post" action="/admin/shows/${show.id}/send" class="btns" style="margin-top:18px"><button class="primary" type="submit"${to ? '' : ' disabled'}>${update ? 'Send updated schedule' : 'Send final schedule'}</button><a class="btn" href="/admin/shows/${show.id}">Cancel</a></form>
</section></div>`;
}

/* ---------------- run sheet ---------------- */

export function runSheet({ show, settings }) {
  return `<div class="wrap" style="max-width:820px"><section>
<div class="btns noprint" style="margin-bottom:16px"><a class="btn small" href="/admin/shows/${show.id}">← Back</a><button class="small" data-print>Print</button></div>
<p class="eyebrow">Run sheet · Trivial Thursdays on ${esc(settings.station_name || 'WRFL')}</p>
<h1 style="font-size:2rem">${esc(longDate(show.air_date))}</h1>${show.title ? `<p><strong>${esc(show.title)}</strong></p>` : ''}
${show.notes ? `<p class="small">${esc(show.notes)}</p>` : ''}
<div class="tablewrap"><table><thead><tr><th>Time</th><th>Min</th><th>Segment</th><th>Contact</th><th>Notes</th></tr></thead><tbody>
${show.slots.map((s) => {
    const c = s.content;
    return `<tr><td class="nowrap num"><strong>${fmtTime(s.start_min)}</strong></td><td class="num">${s.duration_min}</td>
<td><strong>${esc(c ? c.public_name : s.label)}</strong>${c ? `<br><span class="small muted">${esc(s.label)} · ${APPEAR_LABEL[c.appearance || '']}${s.confirmed ? '' : ' · NOT CONFIRMED'}</span>` : ''}${c?.performers ? `<br><span class="small">Performers: ${esc(c.performers)}</span>` : ''}${c?.setup_needs ? `<br><span class="small">Setup: ${esc(c.setup_needs)}</span>` : ''}</td>
<td class="small">${c ? [c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).map(esc).join('<br>') : ''}</td><td class="small">${esc(s.notes)}</td></tr>`;
  }).join('')}
</tbody></table></div>
<p class="small muted" style="margin-top:12px">Printed from the Trivial Thursdays admin. Contains private contact details.</p>
</section></div>`;
}

/* ---------------- Past shows ---------------- */

export function pastList({ shows }) {
  return `<div class="wrap"><section>
<div class="pagehead"><div><p class="eyebrow">Admin</p><h1>Past shows</h1></div></div>
${shows.length ? shows.map((sh) => `<div class="showrow">${dateBlock(sh.air_date)}
<div><a href="/admin/shows/${sh.id}"><strong>${esc(longDate(sh.air_date))}</strong></a>${sh.title ? ` <span class="muted">· ${esc(sh.title)}</span>` : ''}
${miniLineup(sh)}${sh.after_notes ? `<p class="small muted" style="margin:6px 0 0">${esc(sh.after_notes)}</p>` : ''}</div>
<div class="acts btns">${safeUrl(sh.recording_url) ? `<a class="btn small" href="${esc(sh.recording_url)}">Recording</a>` : ''}<a class="btn small" href="/admin/shows/${sh.id}">Open</a></div></div>`).join('') : '<p class="tba">No past shows yet.</p>'}
</section></div>`;
}

/* ---------------- Inbox ---------------- */

export const INBOX_TABS = [
  ['new', 'New', ['new']], ['reviewing', 'Reviewing', ['reviewing']], ['approved', 'Approved', ['approved']],
  ['scheduled', 'Scheduled', ['scheduled']], ['hold', 'On hold', ['hold']], ['declined', 'Declined', ['declined', 'withdrawn']],
  ['aired', 'Aired', ['aired']], ['all', 'All', null],
];

export function inboxList({ items, tab, counts, q, perm, flash, today }) {
  const n = (stages) => (stages ? stages.reduce((t, s) => t + (counts[s] || 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0));
  return `<div class="wrap"><section>
<div class="pagehead"><div><p class="eyebrow">Admin</p><h1>Content Inbox</h1></div>
<div class="btns"><form method="get" action="/admin/inbox" class="btns"><input type="hidden" name="tab" value="${esc(tab)}"><input type="search" name="q" value="${esc(q)}" placeholder="Search name, topic, email" style="width:230px" aria-label="Search"><button class="small" type="submit">Search</button></form>
${perm.edit ? '<a class="btn small primary" href="/admin/content/new">+ Add content</a>' : ''}</div></div>
${flashHtml(flash)}
<nav class="tabs" aria-label="Stages">${INBOX_TABS.map(([k, l, st]) => `<a href="/admin/inbox?tab=${k}"${k === tab ? ' aria-current="page"' : ''}>${l} <span class="muted">${n(st)}</span></a>`).join('')}</nav>
${items.length ? `<div class="tablewrap"><table><thead><tr><th>Received</th><th>Type</th><th>Suggestion</th><th>From</th><th>Timing</th><th>Status</th></tr></thead><tbody>
${items.map((it) => {
    const soon = it.event_date && it.event_date >= today && daysBetween(today, it.event_date) <= 21 && !['scheduled', 'aired', 'declined', 'withdrawn'].includes(it.stage);
    return `<tr><td class="nowrap small">${esc(String(it.created_at).slice(0, 10))}</td><td class="small nowrap">${esc(KIND_LABEL[it.kind])}</td>
<td><a href="/admin/content/${it.id}"><strong>${esc(it.public_name || it.title)}</strong></a>${it.organization ? `<br><span class="small muted">${esc(it.organization)}</span>` : ''}${it.related_count ? ` <span class="tag plain" title="Earlier items from this person or organization">Returning</span>` : ''}</td>
<td class="small">${esc(it.contact_name)}${it.contact_email ? `<br><span class="muted">${esc(it.contact_email)}</span>` : ''}${it.source === 'legacy' ? '<span class="muted">Imported</span>' : ''}</td>
<td class="small nowrap">${it.air_date ? `On air ${esc(mediumDate(it.air_date))}` : it.event_date ? `Event ${esc(it.event_date)}${soon ? ' <span class="tag warn">Soon</span>' : ''}` : '<span class="muted">—</span>'}</td>
<td>${stageTag(it.stage)}</td></tr>`;
  }).join('')}
</tbody></table></div>` : `<p class="tba">Nothing here${q ? ' matches that search' : ''}.</p>`}
</section></div>`;
}

/* ---------------- one content item ---------------- */

function contentFields(c, readOnly) {
  const v = (k) => esc(c?.[k] ?? '');
  const dis = readOnly ? ' disabled' : '';
  return `<div class="grid2">
<div><label for="kind">Type</label><select id="kind" name="kind"${dis}>${Object.entries(KIND_LABEL).map(([k, l]) => opt(k, l, c?.kind || 'guest')).join('')}</select></div>
<div><label for="appearance">Appearance</label><select id="appearance" name="appearance"${dis}>${Object.entries(APPEAR_LABEL).map(([k, l]) => opt(k, l, c?.appearance || '')).join('')}</select></div></div>
<label for="title">Working title / topic</label><input id="title" name="title" required value="${v('title')}"${dis}>
<label for="public_name">Public name <span class="hint">how it reads on the website schedule</span></label><input id="public_name" name="public_name" value="${v('public_name')}" placeholder="Defaults to the title"${dis}>
<label for="public_note">Public note <span class="hint">small aside, e.g. "Voter Reg. Deadline"</span></label><input id="public_note" name="public_note" value="${v('public_note')}"${dis}>
<label for="description">Description</label><textarea id="description" name="description"${dis}>${v('description')}</textarea>
<div class="grid2">
<div><label for="organization">Organization</label><input id="organization" name="organization" value="${v('organization')}"${dis}></div>
<div><label for="link">Public link</label><input id="link" name="link" type="url" value="${v('link')}"${dis}></div>
<div><label for="event_date">Event date</label><input id="event_date" name="event_date" type="date" value="${v('event_date')}"${dis}></div>
<div><label for="date_preferences">Date preferences</label><input id="date_preferences" name="date_preferences" value="${v('date_preferences')}"${dis}></div>
<div><label for="performers">Performers</label><input id="performers" name="performers" value="${v('performers')}"${dis}></div>
<div><label for="setup_needs">Setup needs</label><input id="setup_needs" name="setup_needs" value="${v('setup_needs')}"${dis}></div></div>
<h3 style="margin-top:20px">Contact <span class="muted small">(private)</span></h3>
<div class="grid2">
<div><label for="contact_name">Name</label><input id="contact_name" name="contact_name" value="${v('contact_name')}"${dis}></div>
<div><label for="contact_email">Email</label><input id="contact_email" name="contact_email" type="email" value="${v('contact_email')}"${dis}></div>
<div><label for="contact_phone">Phone</label><input id="contact_phone" name="contact_phone" value="${v('contact_phone')}"${dis}></div></div>
<label for="internal_notes">Internal notes</label><textarea id="internal_notes" name="internal_notes"${dis}>${v('internal_notes')}</textarea>`;
}

export function contentNew({ flash }) {
  return `<div class="wrap"><section style="max-width:820px">
<p class="small"><a href="/admin/inbox">← Inbox</a></p><h1>Add content</h1>
<p class="muted">For guests you line up yourself, like regulars. Items added here start as Approved and are ready to schedule.</p>
${flashHtml(flash)}
<form class="fields card" method="post" action="/admin/content">${contentFields(null, false)}
<p style="margin-top:16px"><button class="primary" type="submit">Add content</button></p></form></section></div>`;
}

const STAGE_ACTIONS = [
  ['reviewing', 'Mark reviewing'], ['approved', 'Approve'], ['hold', 'Put on hold'], ['declined', 'Decline'], ['withdrawn', 'Withdrawn'],
];

export function contentDetail({ c, perm, flash, openSlots }) {
  const place = c.placement;
  const byDate = new Map();
  for (const s of openSlots) (byDate.get(s.air_date) || byDate.set(s.air_date, []).get(s.air_date)).push(s);
  const canSchedule = perm.edit && ['approved', 'scheduled', 'new', 'reviewing', 'hold'].includes(c.stage);
  return `<div class="wrap"><section>
<p class="small"><a href="/admin/inbox">← Inbox</a></p>
<div class="pagehead"><div><p class="eyebrow">${esc(KIND_LABEL[c.kind])} · ${c.source === 'form' ? 'Submitted through the website' : c.source === 'legacy' ? 'Imported' : 'Added by an admin'} · ${esc(String(c.created_at).slice(0, 10))}</p><h1>${esc(c.public_name || c.title)}</h1></div><div>${stageTag(c.stage)}</div></div>
${flashHtml(flash)}
<div class="side">
<div>
${perm.edit ? `<form class="fields card" method="post" action="/admin/content/${c.id}">${contentFields(c, false)}<p style="margin-top:16px"><button class="primary" type="submit">Save changes</button></p></form>` : `<div class="fields card">${contentFields(c, true)}</div>`}
${c.contact_purged_at ? `<p class="small muted">Contact details were erased on ${esc(String(c.contact_purged_at).slice(0, 10))} under the retention policy.</p>` : ''}
</div>
<div class="stack">
<div class="card"><h3>Status</h3>
${place ? `<p>On the <a href="/admin/shows/${place.show_id}">${esc(longDate(place.air_date))}</a> show at ${fmtTime(place.start_min)} (${esc(place.label)})${place.confirmed ? ', confirmed' : ', not confirmed yet'}.</p>` : `<p class="muted small">Not on a show.</p>`}
${perm.edit ? `<form method="post" action="/admin/content/${c.id}/stage" class="fields"><label for="stage_note">Note <span class="hint">(optional, kept in history)</span></label><textarea id="stage_note" name="note" rows="2" style="min-height:60px"></textarea>
<div class="btns" style="margin-top:10px">${STAGE_ACTIONS.filter(([st]) => st !== c.stage && !(place && ['reviewing', 'approved'].includes(st))).map(([st, l]) => `<button class="small${st === 'approved' ? ' primary' : st === 'declined' ? ' danger' : ''}" name="stage" value="${st}" type="submit">${l}</button>`).join('')}</div></form>` : ''}
</div>
${canSchedule ? `<div class="card"><h3>${place ? 'Move to another slot' : 'Schedule into a show'}</h3>
${openSlots.length ? `<form method="post" action="/admin/content/${c.id}/place" class="fields"><label for="slot_id">Open slot</label><select id="slot_id" name="slot_id" required>${[...byDate].map(([d, ss]) => `<optgroup label="${esc(mediumDate(d))}">${ss.map((s) => `<option value="${s.id}">${esc(mediumDate(d))} · ${fmtClock(s.start_min)} · ${esc(s.label)}</option>`).join('')}</optgroup>`).join('')}</select>
<p style="margin-top:10px"><button class="primary small" type="submit">${place ? 'Move here' : c.stage === 'approved' ? 'Schedule' : 'Approve and schedule'}</button></p></form>` : '<p class="muted small">No open slots in upcoming shows. Add a show or free a slot on the Show Layout page.</p>'}</div>` : ''}
${c.related.length ? `<div class="card"><h3>Earlier from this person or organization</h3><ul class="hist">${c.related.map((r) => `<li><a href="/admin/content/${r.id}">${esc(r.title)}</a> ${stageTag(r.stage)}${r.air_date ? ` <span class="small muted">on air ${esc(r.air_date)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
<div class="card"><h3>History</h3><ul class="hist">${c.history.map((h) => `<li>${h.from_stage ? `${esc(STAGE_LABEL[h.from_stage] || h.from_stage)} → ` : ''}<strong>${esc(STAGE_LABEL[h.to_stage] || h.to_stage)}</strong>${h.note ? `: ${esc(h.note)}` : ''}<br><span class="small muted">${esc(h.actor)} · ${fmtStamp(h.at)}</span></li>`).join('')}</ul></div>
<div class="card"><h3>Emails</h3>${emailMiniList(c.emails)}</div>
</div></div>
</section></div>`;
}

/* ---------------- Email log ---------------- */

export function emailLog({ emails, settings, hasBinding }) {
  const kindLabel = { submission_ack: 'Submission confirmation', submission_alert: 'New submission alert', schedule_forward: 'Schedule (forwardable)', schedule_owner: 'Run sheet' };
  return `<div class="wrap"><section>
<div class="pagehead"><div><p class="eyebrow">Admin</p><h1>Email log</h1></div></div>
<p class="small muted">Admin email: <strong>${settings.email_admins_enabled === '1' ? 'on' : 'off'}</strong> · Submitter confirmations: <strong>${settings.email_guests_enabled === '1' ? 'on' : 'off'}</strong> · Email Service binding: <strong>${hasBinding ? 'configured' : 'not configured'}</strong>. "Logged only" means the email was written here but not delivered.</p>
${emails.length ? `<div class="tablewrap"><table><thead><tr><th>When</th><th>Type</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>
${emails.map((e) => `<tr><td class="nowrap small">${fmtStamp(e.created_at)}</td><td class="small">${esc(kindLabel[e.kind] || e.kind)}</td><td class="small">${esc(e.to_addr)}</td>
<td><details><summary>${esc(e.subject)}</summary><pre class="mail">${esc(e.body_text)}</pre></details>${e.show_id ? `<span class="small"><a href="/admin/shows/${e.show_id}">Show ${esc(e.air_date || '')}</a></span>` : ''}${e.content_id ? ` <span class="small"><a href="/admin/content/${e.content_id}">Content item</a></span>` : ''}</td>
<td><span class="tag ${e.status === 'sent' ? 'ok' : e.status === 'failed' ? 'bad' : 'plain'}">${e.status === 'logged' ? 'Logged only' : e.status}</span>${e.error ? `<br><span class="small" style="color:var(--bad)">${esc(e.error)}</span>` : ''}</td></tr>`).join('')}
</tbody></table></div>` : '<p class="tba">No emails yet.</p>'}
</section></div>`;
}

/* ---------------- Settings ---------------- */

const SITE_FIELDS = [
  ['tagline', 'Tagline / intro paragraph', 'textarea'], ['airtime', 'Air time'], ['station_name', 'Station name'], ['station_url', 'Station / live stream link'],
  ['facebook_url', 'Facebook Live link'], ['host_name', 'Host'], ['logo_url', 'Logo image URL'], ['current_season', 'Current season (default on /schedule)'], ['site_url', 'Site address (used in emails)'],
];
const NOTIFY_FIELDS = [
  ['alert_email', 'Notification emails', 'Get new-submission alerts and the "schedule is set" emails. Separate several addresses with commas.'],
  ['from_email', 'Send from', 'Must be on a domain onboarded to Cloudflare Email Sending.'],
  ['from_name', 'Sender name', ''],
  ['email_subject_prefix', 'Subject prefix', 'Added to the start of every email subject, e.g. [TEST] during testing. Clear it to stop.'],
  ['arrive_before_min', 'In-studio guests arrive this many minutes early', 'Leave blank to leave arrival times out.'],
  ['station_address', 'Station address (for guests)', ''],
  ['dayof_contact', 'Day-of contact line (for guests)', 'e.g. a phone number for day-of problems'],
];
export const SETTING_KEYS = [...SITE_FIELDS.map((f) => f[0]), ...NOTIFY_FIELDS.map((f) => f[0]), 'email_admins_enabled', 'email_guests_enabled', 'retention_months', 'show_start'];

function tplRow(r) {
  return `<div class="slot kind-${r.slot_type || 'guest'}" data-row style="grid-template-columns:62px 70px 160px minmax(180px,1fr) auto;min-width:560px">
<span class="t" data-time></span><input name="duration_min" type="number" min="0" max="120" value="${r.duration_min ?? 15}" aria-label="Minutes">
<select name="slot_type" aria-label="Type">${Object.entries(SLOT_LABEL).map(([k, l]) => opt(k, l, r.slot_type || 'guest')).join('')}</select>
<input name="label" value="${esc(r.label ?? 'Guest segment')}" aria-label="Label">
<span class="rowbtns"><button class="icon" data-act="up" aria-label="Move up">↑</button><button class="icon" data-act="down" aria-label="Move down">↓</button><button class="icon" data-act="del" aria-label="Remove">✕</button></span></div>`;
}

export function settingsPage({ settings: s, template, flash, env }) {
  const checked = (k) => (s[k] === '1' ? ' checked' : '');
  return `<div class="wrap"><section style="max-width:900px">
<div class="pagehead"><div><p class="eyebrow">Admin · Owner</p><h1>Settings</h1></div></div>
${flashHtml(flash)}
<form class="fields card" method="post" action="/admin/settings">
<h3>Notifications</h3>
${NOTIFY_FIELDS.map(([k, l, h]) => `<label for="${k}">${l}${h ? ` <span class="hint">${esc(h)}</span>` : ''}</label><input id="${k}" name="${k}" value="${esc(s[k])}"${k === 'arrive_before_min' ? ' type="number" min="0" max="120"' : ''}>`).join('')}
<input type="hidden" name="email_admins_enabled" value="0"><input type="hidden" name="email_guests_enabled" value="0">
<label style="display:flex;gap:10px;font-weight:500;margin-top:16px"><input type="checkbox" name="email_admins_enabled" value="1"${checked('email_admins_enabled')}> <span>Send email to Mick <span class="hint">Works on the free plan once Mick's address is verified in Cloudflare Email Routing.</span></span></label>
<label style="display:flex;gap:10px;font-weight:500"><input type="checkbox" name="email_guests_enabled" value="1"${checked('email_guests_enabled')}> <span>Send confirmation emails to people who submit the form <span class="hint">Requires the Workers Paid plan. While off, confirmations are saved to the Email log only.</span></span></label>
<p class="small muted">Email Service binding: <strong>${env.EMAIL ? 'configured' : 'not configured yet'}</strong> · Spam check (Turnstile): <strong>${env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? 'on' : 'off, using honeypot and rate limit only'}</strong></p>
<h3 style="margin-top:24px">Privacy</h3>
<label for="retention_months">Erase contact details of declined or withdrawn suggestions after this many months</label><input id="retention_months" name="retention_months" type="number" min="1" max="120" value="${esc(s.retention_months || '12')}">
<h3 style="margin-top:24px">Website</h3>
${SITE_FIELDS.map(([k, l, t]) => `<label for="${k}">${l}</label>${t === 'textarea' ? `<textarea id="${k}" name="${k}">${esc(s[k])}</textarea>` : `<input id="${k}" name="${k}" value="${esc(s[k])}">`}`).join('')}
<label for="show_start">Show start time <span class="hint">24-hour, e.g. 10:00</span></label><input id="show_start" name="show_start" value="${esc(s.show_start || '10:00')}" pattern="\\d{1,2}:\\d{2}">
<p style="margin-top:16px"><button class="primary" type="submit">Save settings</button></p></form>

<h2 style="margin-top:36px">Default show layout</h2>
<p class="muted small">New shows start from this layout. Changing it doesn't affect shows that already exist; use "Reset to default layout" on a show to apply it there.</p>
<form method="post" action="/admin/settings/template" data-rows data-start="${(() => { const m = String(s.show_start || '10:00').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : 600; })()}" data-target="120">
<div class="total"><span data-total class="tag"></span></div>
<div class="slots"><div data-list>${template.map(tplRow).join('')}</div></div>
<template>${tplRow({})}</template>
<div class="btns" style="margin-top:12px"><button class="small" data-act="add">+ Add slot</button><button class="primary" type="submit">Save default layout</button></div>
</form>
</section></div>`;
}

/* ---------------- People ---------------- */

export function peoplePage({ users, me, flash, activity }) {
  return `<div class="wrap"><section style="max-width:980px">
<div class="pagehead"><div><p class="eyebrow">Admin · Owner</p><h1>People</h1></div></div>
${flashHtml(flash)}
<p class="small muted">People sign in with Cloudflare Access; this list decides what each person can do. Anyone you add here must also be allowed by the Access policy for /admin.</p>
<div class="card small" style="margin-bottom:16px"><strong>Owner</strong>: everything, including Settings and People. <strong>Producer</strong>: review the Inbox, build layouts, send schedules. <strong>Viewer</strong>: read-only access to layouts, the Inbox and run sheets.</div>
<div class="tablewrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>
${users.map((u) => `<tr><td colspan="5" style="padding:0"><form method="post" action="/admin/people" style="display:grid;grid-template-columns:minmax(200px,1.4fr) minmax(120px,1fr) 130px 120px auto;gap:8px;padding:9px 10px;align-items:center;min-width:700px">
<span>${esc(u.email)}${u.email === me ? ' <span class="muted small">(you)</span>' : ''}<input type="hidden" name="email" value="${esc(u.email)}"></span>
<input name="name" value="${esc(u.name)}" aria-label="Name"><select name="role" aria-label="Role">${ROLES.map((r) => opt(r, ROLE_LABEL[r], u.role)).join('')}</select>
<select name="active" aria-label="Access">${opt('1', 'Active', u.active)}${opt('0', 'Removed', u.active)}</select><button class="small" type="submit">Save</button></form></td></tr>`).join('')}
</tbody></table></div>
<h3 style="margin-top:24px">Add a person</h3>
<form class="fields card" method="post" action="/admin/people"><div class="grid2">
<div><label for="new_email">Email</label><input id="new_email" name="email" type="email" required></div>
<div><label for="new_name">Name</label><input id="new_name" name="name"></div>
<div><label for="new_role">Role</label><select id="new_role" name="role">${ROLES.map((r) => opt(r, ROLE_LABEL[r], 'producer')).join('')}</select></div></div>
<input type="hidden" name="active" value="1"><p style="margin-top:14px"><button class="primary" type="submit">Add person</button></p></form>
<h3 style="margin-top:28px">Recent admin activity</h3>
<div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
${activity.map((a) => `<tr><td class="nowrap small">${fmtStamp(a.at)}</td><td class="small">${esc(a.actor)}</td><td class="small">${esc(a.action)}${a.target_id ? ` #${a.target_id}` : ''}</td><td class="small">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No activity yet.</td></tr>'}
</tbody></table></div>
</section></div>`;
}

export function deniedPage(msg) {
  return `<div class="wrap"><section class="hero" style="max-width:640px"><h1>No access</h1><p class="lede">${esc(msg)}</p></section></div>`;
}
