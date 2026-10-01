// Email: every message is written to email_log. It is actually sent only when
//  - the EMAIL binding (Cloudflare Email Service) is configured, and
//  - the matching switch is on in Settings: admins (free plan, verified addresses) or guests (Workers Paid).
import { esc, fmtTime, longDate, APPEAR_LABEL, isEmail } from './util.js';

const ADMIN_KINDS = new Set(['submission_alert', 'schedule_forward', 'schedule_owner']);

export async function sendEmail(env, settings, { kind, to, subject, text, show_id = null, content_id = null, actor = 'system', replyTo }) {
  const toAdmin = ADMIN_KINDS.has(kind);
  const enabled = toAdmin ? settings.email_admins_enabled === '1' : settings.email_guests_enabled === '1';
  let status = 'logged', error = '';
  if (!isEmail(to)) { status = 'failed'; error = 'Invalid email address'; }
  else if (enabled && env.EMAIL && settings.from_email) {
    try {
      await env.EMAIL.send({
        to,
        from: { email: settings.from_email, name: settings.from_name || 'Trivial Thursdays' },
        subject,
        text,
        html: textToHtml(text),
        ...(replyTo && isEmail(replyTo) ? { replyTo } : {}),
      });
      status = 'sent';
    } catch (e) {
      status = 'failed';
      error = `${e.code || ''} ${e.message || e}`.trim().slice(0, 500);
    }
  } else if (enabled && !env.EMAIL) {
    error = 'Email binding not configured';
  }
  await env.DB.prepare('INSERT INTO email_log (kind, to_addr, subject, body_text, show_id, content_id, status, error, actor) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
    .bind(kind, to || '', subject, text, show_id, content_id, status, error, actor)
    .run();
  return status;
}

/** Plain text → simple, readable HTML (links clickable). */
function textToHtml(text) {
  const body = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1f1c18;max-width:560px">${body}</div>`;
}

const sig = (s) => `— ${s.from_name || 'Trivial Thursdays on WRFL'}\n${s.site_url || ''}`.trim();

/* ---------------- templates ---------------- */

export function submissionAck(s, c) {
  return {
    subject: 'We received your suggestion for Trivial Thursdays',
    text: `Hi ${c.contact_name || 'there'},

Thanks for suggesting "${c.title}" for Trivial Thursdays on ${s.station_name || 'WRFL'}. Mick reviews every suggestion, and we'll be in touch if it's a fit for an upcoming show.

What you sent:
Type: ${c.kind_label}
Topic: ${c.title}
${c.event_date ? `Date it's tied to: ${c.event_date}\n` : ''}${c.date_preferences ? `Date preferences: ${c.date_preferences}\n` : ''}
${c.description}

${sig(s)}`,
  };
}

export function submissionAlert(s, c, adminUrl) {
  return {
    subject: `New suggestion: ${c.title}`,
    text: `A new suggestion came in through the website.

${c.kind_label}: ${c.title}
From: ${c.contact_name} <${c.contact_email}>${c.contact_phone ? `, ${c.contact_phone}` : ''}
${c.organization ? `Organization: ${c.organization}\n` : ''}${c.event_date ? `Event date: ${c.event_date}\n` : ''}${c.date_preferences ? `Date preferences: ${c.date_preferences}\n` : ''}Appearance: ${APPEAR_LABEL[c.appearance || '']}
${c.link ? `Link: ${c.link}\n` : ''}
${c.description}
${c.related_count ? `\nThis person or organization has ${c.related_count} earlier item(s) on file.\n` : ''}
Review it: ${adminUrl}`,
  };
}

/** Public lineup lines (no contact info). */
export function lineupText(show) {
  return show.slots
    .filter((sl) => sl.content && sl.public)
    .map((sl) => `${fmtTime(sl.start_min)}  ${sl.content.public_name}${sl.content.public_note ? ` (${sl.content.public_note})` : ''}`)
    .join('\n');
}

function logistics(s) {
  const lines = [];
  if (s.station_address) lines.push(`Where: ${s.station_address}`);
  if (s.dayof_contact) lines.push(`Day-of contact: ${s.dayof_contact}`);
  return lines.join('\n');
}

/**
 * "Schedule is set" email #1: safe to forward to every guest. Public lineup and logistics only, no contact details.
 */
export function scheduleForward(s, show, { update = false } = {}) {
  const arrive = Number(s.arrive_before_min);
  const rows = show.slots
    .filter((sl) => sl.content && sl.public)
    .map((sl) => {
      const c = sl.content;
      const arr = c.appearance === 'studio' && arrive > 0 ? `  (in studio, please arrive by ${fmtTime(sl.start_min - arrive)})` : c.appearance === 'phone' ? '  (by phone, we will call you)' : c.appearance === 'remote' ? '  (remote, connection details to follow)' : '';
      return `${fmtTime(sl.start_min)} to ${fmtTime(sl.start_min + sl.duration_min)}  ${c.public_name}${arr}`;
    })
    .join('\n');
  return {
    subject: `${update ? 'UPDATED: ' : ''}Trivial Thursdays schedule for ${longDate(show.air_date)}`,
    text: `Hello, and thanks for being part of Trivial Thursdays on ${s.station_name || 'WRFL'}!

${update ? 'The schedule has changed. Here is the updated lineup' : 'The schedule is set. Here is the lineup'} for ${longDate(show.air_date)}${show.title ? `, "${show.title}"` : ''}:

${rows || '(no segments scheduled)'}

${logistics(s) ? logistics(s) + '\n\n' : ''}Listen live on ${s.station_name || 'WRFL'}${s.station_url ? ` (${s.station_url})` : ''}${s.facebook_url ? ` or watch on Facebook Live (${s.facebook_url})` : ''}.

See you Thursday!
${sig(s)}`,
  };
}

/**
 * "Schedule is set" email #2: private run sheet for Mick, with contacts, notes, who to forward #1 to, and what changed.
 */
export function scheduleOwner(s, show, { update = false, forwardTo = [], changes = null, missing = [] } = {}) {
  const rows = show.slots
    .map((sl) => {
      const c = sl.content;
      const who = c
        ? `${c.public_name}${c.contact_name || c.contact_email || c.contact_phone ? `\n        Contact: ${[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(', ')}` : ''}\n        ${APPEAR_LABEL[c.appearance || '']}${sl.confirmed ? ', confirmed' : ', NOT confirmed'}`
        : sl.slot_type === 'program' || sl.slot_type === 'break' ? '' : '(open)';
      return `${fmtTime(sl.start_min)}  ${sl.label} (${sl.duration_min} min)${who ? `\n        ${who}` : ''}${sl.notes ? `\n        Notes: ${sl.notes}` : ''}`;
    })
    .join('\n\n');
  const changeText = changes
    ? `What changed since the last send:\n${[
        ...changes.added.map((c) => `  Added: ${c.public_name}`),
        ...changes.moved.map((c) => `  New time: ${c.public_name}`),
        ...changes.removed.map((c) => `  Removed: ${c.public_name}${c.contact_email ? ` <${c.contact_email}>` : ''} (let them know separately)`),
      ].join('\n') || '  Details only (notes or wording)'}\n\n`
    : '';
  return {
    subject: `${update ? 'Updated run sheet' : 'Run sheet'} (private): Trivial Thursdays, ${longDate(show.air_date)}`,
    text: `This is your private run sheet. Don't forward this one; it has everyone's contact details.

Forward the other email ("${update ? 'UPDATED: ' : ''}Trivial Thursdays schedule for ${longDate(show.air_date)}") to:
${forwardTo.length ? forwardTo.join(', ') : '(no guest email addresses on file)'}
${missing.length ? `\nNo email on file for: ${missing.join(', ')}\n` : ''}
${changeText}${show.title ? `${show.title}\n` : ''}${longDate(show.air_date)}

${rows}
${show.notes ? `\nShow notes: ${show.notes}\n` : ''}`,
  };
}
