// Shared helpers: escaping, dates/times in the show's time zone, form parsing.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const safeUrl = (u) => (/^https?:\/\/[^\s<>"]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

export const isEmail = (s) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(s || '').trim()) && String(s).length <= 254;

const fmt = (date, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));
export const longDate = (d) => fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const mediumDate = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
export const monthDay = (d) => fmt(d, { month: 'short', day: 'numeric' });
export const dow = (d) => fmt(d, { weekday: 'short' });

/** 600 -> "10:00 AM" */
export function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const fmtClock = (min) => fmtTime(min).replace(/ (AM|PM)$/, '');

export function parseClock(s, fallback = 600) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** Current date/time in the show's time zone. */
export function showClock(tz = 'America/New_York') {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { today: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
}

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function nextThursdayOnOrAfter(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, (4 - d.getUTCDay() + 7) % 7);
}
export const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

export const str = (form, k, max = 2000) => String(form.get(k) ?? '').trim().slice(0, max);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const KIND_LABEL = { guest: 'Guest', music: 'Musical guest', announcement: 'Event / announcement', feature: 'Feature' };
export const SLOT_LABEL = { program: 'Host segment', guest: 'Guest', music: 'Musical guest', announcement: 'Announcement', feature: 'Feature', break: 'Break' };
export const STAGE_LABEL = {
  new: 'New', reviewing: 'Reviewing', approved: 'Approved', scheduled: 'Scheduled', aired: 'Aired',
  declined: 'Declined', hold: 'On hold', withdrawn: 'Withdrawn',
};
export const APPEAR_LABEL = { '': 'Not specified', studio: 'In studio', phone: 'By phone', remote: 'Remote / video' };
export const CONTENT_SLOT_TYPES = ['guest', 'music', 'announcement', 'feature'];

/** Settings may hold several addresses separated by commas; returns the valid ones, de-duplicated. */
export const emailList = (v) => [...new Set(String(v || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(isEmail))];
