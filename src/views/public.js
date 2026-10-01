// Public pages. Only public data reaches these views: names, notes and links, never contact details.
import { esc, safeUrl, longDate, monthDay, dow, fmtTime, KIND_LABEL } from '../util.js';

/** Public lineup for a show: slots with content marked public. */
export const publicLineup = (show) => show.slots.filter((sl) => sl.content && sl.public);

export function lineupHtml(show, { times = false } = {}) {
  const items = publicLineup(show);
  if (!items.length) return `<p class="tba">Lineup to be announced</p>`;
  return `<ul class="segs">${items
    .map((sl) => {
      const c = sl.content;
      const url = safeUrl(c.link);
      const name = url ? `<a href="${esc(url)}" rel="noopener">${esc(c.public_name)}</a>` : esc(c.public_name);
      const tag = c.kind === 'music' ? '<span class="tag music">Musical guest</span>' : c.kind === 'feature' ? '<span class="tag">Special</span>' : '';
      const note = c.public_note ? ` <span class="note">(${esc(c.public_note)})</span>` : '';
      return `<li>${times ? `<span class="muted num">${fmtTime(sl.start_min)}</span> · ` : ''}${tag}${name}${note}</li>`;
    })
    .join('')}</ul>`;
}

export function showItem(show, today) {
  return `<li class="ep${show.air_date < today ? ' past' : ''}" id="d${esc(show.air_date)}">
<div class="date"><span class="d">${dow(show.air_date)}</span><span class="md">${monthDay(show.air_date)}</span></div>
<div>${show.title ? `<div class="ep-title">${esc(show.title)}</div>` : ''}${lineupHtml(show)}</div></li>`;
}

export function homePage({ settings: s, next, upcoming, today, onAir }) {
  const listen = safeUrl(s.station_url), fb = safeUrl(s.facebook_url);
  const nextBlock = next
    ? `<section><div class="next">
<p class="eyebrow">${onAir ? '<span class="onair">On air now</span>' : next.air_date === today ? 'Today' : 'Next show'}</p>
<h2>${esc(longDate(next.air_date))}</h2>${next.title ? `<div class="ep-title">${esc(next.title)}</div>` : ''}
${lineupHtml(next)}</div></section>`
    : '';
  return `<div class="wrap">
<section class="hero">
<p class="eyebrow">Hello, radio friends!</p>
<h1>Trivial Thursdays on ${esc(s.station_name || 'WRFL')}</h1>
<p class="lede">${esc(s.tagline || '')}</p>
<div class="airtime">${esc(s.airtime || '')}</div>
<div class="btns">${listen ? `<a class="btn primary" href="${esc(listen)}">Listen on WRFL</a>` : ''}${fb ? `<a class="btn" href="${esc(fb)}">Watch on Facebook Live</a>` : ''}<a class="btn" href="/suggest">Suggest a guest</a></div>
</section>
${nextBlock}
<section><h2>Coming up</h2>
${upcoming.length ? `<ul class="eps">${upcoming.map((e) => showItem(e, today)).join('')}</ul>` : '<p class="tba">More shows coming soon.</p>'}
<p><a href="/schedule">Full season schedule →</a></p></section>
</div>`;
}

export function schedulePage({ season, seasons, shows, today }) {
  return `<div class="wrap"><section>
<p class="eyebrow">Guest schedule</p><h1>${esc(season || 'Schedule')}</h1>
${seasons.length > 1 ? `<div class="season-nav">${seasons.map((x) => `<a href="/schedule?season=${encodeURIComponent(x)}"${x === season ? ' aria-current="true"' : ''}>${esc(x)}</a>`).join('')}</div>` : ''}
${shows.length ? `<ul class="eps">${shows.map((e) => showItem(e, today)).join('')}</ul>` : '<p class="tba">No shows listed yet.</p>'}
<p class="muted">Have a guest, event or musician in mind? <a href="/suggest">Suggest them for the show</a>.</p>
</section></div>`;
}

export function suggestPage({ values = {}, errors = [], turnstileKey = '' }) {
  const v = (k) => esc(values[k] ?? '');
  const sel = (k, val) => (values[k] === val ? ' selected' : '');
  return `<div class="wrap"><section style="max-width:760px">
<p class="eyebrow">Be on the show</p>
<h1>Suggest a guest or event</h1>
<p class="lede muted">Trivial Thursdays covers Lexington's people, arts, causes and events. Tell us who or what listeners should hear about. Mick reads every suggestion and will be in touch if it's a fit.</p>
${errors.length ? `<div class="flash bad" role="alert"><strong>Please fix the following:</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
<form class="fields card" method="post" action="/suggest" novalidate>
<h3>About you</h3>
<div class="grid2">
<div><label for="contact_name">Your name *</label><input id="contact_name" name="contact_name" required maxlength="120" autocomplete="name" value="${v('contact_name')}"></div>
<div><label for="contact_email">Email *</label><input id="contact_email" name="contact_email" type="email" required maxlength="254" autocomplete="email" value="${v('contact_email')}"></div>
<div><label for="contact_phone">Phone <span class="hint">(optional)</span></label><input id="contact_phone" name="contact_phone" type="tel" maxlength="40" autocomplete="tel" value="${v('contact_phone')}"></div>
<div><label for="organization">Organization <span class="hint">(optional)</span></label><input id="organization" name="organization" maxlength="160" autocomplete="organization" value="${v('organization')}"></div>
</div>
<h3 style="margin-top:22px">Your suggestion</h3>
<label for="kind">What are you suggesting? *</label>
<select id="kind" name="kind" required>${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}"${sel('kind', k)}>${k === 'feature' ? 'Something else' : l}</option>`).join('')}</select>
<label for="title">Title or topic *</label><input id="title" name="title" required maxlength="160" placeholder="e.g. Roots & Heritage Festival 2026" value="${v('title')}">
<label for="description">Tell us about it * <span class="hint">What would listeners hear? Who would be on air?</span></label>
<textarea id="description" name="description" required maxlength="3000" rows="6">${v('description')}</textarea>
<div class="grid2">
<div><label for="event_date">Date it's tied to <span class="hint">(event date or deadline)</span></label><input id="event_date" name="event_date" type="date" value="${v('event_date')}"></div>
<div><label for="appearance">How would you appear?</label><select id="appearance" name="appearance"><option value="">Not sure yet</option><option value="studio"${sel('appearance', 'studio')}>In the studio</option><option value="phone"${sel('appearance', 'phone')}>By phone</option><option value="remote"${sel('appearance', 'remote')}>Remote / video</option></select></div>
</div>
<label for="date_preferences">Preferred or unavailable Thursdays <span class="hint">(optional)</span></label><input id="date_preferences" name="date_preferences" maxlength="300" placeholder="e.g. Any Thursday in October except the 22nd" value="${v('date_preferences')}">
<div class="grid2">
<div><label for="performers">Musical guests: how many performers?</label><input id="performers" name="performers" maxlength="80" value="${v('performers')}"></div>
<div><label for="setup_needs">Musical guests: setup needs</label><input id="setup_needs" name="setup_needs" maxlength="300" placeholder="e.g. acoustic duo, 2 vocal mics" value="${v('setup_needs')}"></div>
</div>
<label for="link">Website or event link <span class="hint">(optional)</span></label><input id="link" name="link" type="url" maxlength="500" placeholder="https://" value="${v('link')}">
<div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<label style="display:flex;gap:10px;align-items:flex-start;font-weight:500"><input type="checkbox" name="consent" value="1"${values.consent ? ' checked' : ''} style="margin-top:5px"> <span>The show may contact me about this suggestion. My contact details stay private and are never published. *</span></label>
${turnstileKey ? `<div class="cf-turnstile" data-sitekey="${esc(turnstileKey)}" style="margin-top:14px"></div>` : ''}
<p style="margin-top:18px"><button class="primary" type="submit">Send suggestion</button></p>
</form></section></div>`;
}

export function thanksPage({ name }) {
  return `<div class="wrap"><section class="hero" style="max-width:700px">
<p class="eyebrow">Received</p><h1>Thanks${name ? `, ${esc(name)}` : ''}!</h1>
<p class="lede">Your suggestion is in. Mick reviews every one and will be in touch if it's a fit for an upcoming show. A confirmation email is on its way.</p>
<div class="btns"><a class="btn" href="/schedule">See the schedule</a><a class="btn" href="/suggest">Suggest something else</a></div>
</section></div>`;
}

export function notFoundPage() {
  return `<div class="wrap"><section class="hero"><h1>Dead air.</h1><p class="lede">That page isn't on the schedule. <a href="/">Head back home</a>.</p></section></div>`;
}
