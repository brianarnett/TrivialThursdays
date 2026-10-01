# Trivial Thursdays on WRFL

Website and show-planning tool for *Trivial Thursdays*, WRFL-FM's Thursday community affairs show (10–noon ET). It replaces trivialthursdays.com, which currently redirects to a Blogger page. It runs as one Cloudflare Worker backed by a D1 database. There's no framework and no build step.

## What it does

**Public site**

| Route | What it does |
|---|---|
| `/` | Intro, air time, the next show's lineup ("On air now" badge Thursdays 10–noon ET), and the shows coming up |
| `/schedule` | The season's lineups, built from each show's slots marked public (`?season=` switches seasons) |
| `/suggest` | Form for suggesting a guest, event or musical act. Spam protection: honeypot field, 5 per hour per IP, and Turnstile when configured |
| `/calendar.ics` | Subscribable calendar feed |
| `/api/episodes` | Public JSON schedule (`?season=`, `?from=`) |

Contact details and internal notes never appear on public pages or in the feeds.

**Admin (`/admin`, behind Cloudflare Access)**

- **Show Layout.** Each upcoming show appears with how many slots are filled, how many guests are confirmed, and warnings. Opening a show gives a 10:00–12:00 timeline of time slots where you pick approved content for each slot, reorder slots, change lengths, mark guests confirmed, and add private prep notes. Times recalculate automatically, and the page warns when the total isn't 120 minutes.
- **Send final schedule.** Emails Mick two messages: a schedule that's safe to forward to guests, and a private run sheet with contacts, prep notes and the list of addresses to forward to. After the schedule has been sent, any change marks the show "Changed since sent". The next send is an update that lists what changed.
- **Run sheet.** A printable rundown for the studio.
- **Inbox.** Suggestions by stage (New, Reviewing, Approved, Scheduled, On hold, Declined, Aired). You can approve, decline, hold or edit an item, or schedule it straight into an open slot. Returning submitters are flagged, and every stage change is kept in the item's history.
- **Past shows.** What aired, with after-show notes and a recording link.
- **Email log.** Every email the system writes, with its delivery status.
- **Settings** (owner only). Notification details, email switches, contact retention, site text, and the **default show layout** that new shows start from.
- **People** (owner only). Admins and their roles, plus recent admin activity.

| | Owner | Producer | Viewer |
|---|---|---|---|
| View layouts, Inbox, run sheets, email log | ✓ | ✓ | ✓ |
| Review content, build layouts | ✓ | ✓ | |
| Send schedules | ✓ | ✓ | |
| Settings, People | ✓ | | |

Cloudflare Access decides who can sign in. The `users` table decides what each person can do. `OWNER_EMAIL` sets the first owner, and everyone else is added on the People page. There must always be at least one active owner.

## Code map

```
src/index.js        routes, form handling, permissions, nightly job
src/auth.js         Access JWT verification + roles
src/data.js         D1 queries (shows, slots, content, users, audit)
src/email.js        email templates + sending/logging
src/util.js         dates, times, escaping, labels
src/views/          layout (CSS, CSP-safe script), public pages, admin pages
migrations/         0001 schema · 0002 Fall 2026 seed · 0003 show layout (moves 0002 data into slots)
scripts/e2e-test.mjs  end-to-end test against wrangler dev
```

## Data model

`shows` → `slots` (start time, minutes, type, label, content, confirmed, public, notes) → `content_items` (the guest/act/announcement plus private contact fields and a stage) → `content_history`. Also `slot_templates` (the default layout), `users`, `email_log`, `audit_log` and `settings`.

A content item fills at most one slot. Its stage follows where it sits: placed in a show means **Scheduled**, in a show that has aired means **Aired**, and removed from a show means back to **Approved**.

## Email

Every email is written to the Email log. It's actually delivered only when the `EMAIL` binding exists and the matching switch in Settings is on:

| Email | Goes to | Plan |
|---|---|---|
| New-submission alert | Mick | Free (address verified in Email Routing) |
| "Schedule is set" (forwardable + run sheet) | Mick | Free (same) |
| Submission confirmation | The submitter | **Workers Paid** ($5/month) |

Sending requirements:
1. trivialthursdays.com is on Cloudflare DNS.
2. The domain is onboarded under **Email Service → Email Sending**.
3. Mick's address is verified in Email Routing.
4. `send_email` is uncommented in `wrangler.jsonc`.

## Deploy

The D1 database `trivial-thursdays` already exists and has migrations 0001–0003 applied. A test copy of the site runs at https://trivial-thursdays.brian-arnett.workers.dev behind Access.

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Then set up admin sign-in with **Cloudflare Access**. This is what worked for the test site in October 2026:
1. **Zero Trust (one time per account).** The first time you use Access, Cloudflare asks you to create a Zero Trust organization. Pick a team name and the **Free** plan. It asks for a card, but the Free plan isn't charged.
2. **Protect the Worker.** Go to Workers & Pages → trivial-thursdays → **Access** tab → **Protect this Worker behind Access** → **All traffic**. Set the policy to **Include → Emails** with each admin's address. Use an *Emails* rule; an "Email domain" rule that contains a full address matches nobody.
3. **Turn on email codes.** Go to Zero Trust → Integrations → **Identity providers** → Add → **One-time PIN**. Without it, the only sign-in method is a Cloudflare account password, so admins without a Cloudflare login can't get in.
4. **First owner.** Set `OWNER_EMAIL` in `wrangler.jsonc` to the address the owner signs in with, then `npx wrangler deploy`. Add everyone else on the People page. They must also be on the Access policy.
5. **Settings.** Fill in Mick's email, arrival minutes, station address and the day-of contact.
6. **Turnstile (optional).** Set `TURNSTILE_SITE_KEY` and run `npx wrangler secret put TURNSTILE_SECRET`.
7. **Domain.** Uncomment `routes` once DNS is on Cloudflare. On the real domain, protect only `/admin*` with a hostname-based Access app so the public pages stay open. Then fill in `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.

With Worker-level Access, the site reads the signed-in person's email from `ctx.access`. With hostname-based Access, it verifies the Access JWT instead.

Everything except guest-facing email fits in the Workers **Free** plan.

## Develop and test

```bash
echo 'DEV_ADMIN_BYPASS=true' > .dev.vars      # local only; you're owner@dev.local
npx wrangler d1 migrations apply trivial-thursdays --local
npx wrangler dev
node scripts/e2e-test.mjs                      # needs a freshly migrated local DB
```

In local dev, sending the header `x-dev-as: someone@example.com` acts as another user, which is how the role tests work. This only happens when Access isn't configured and `DEV_ADMIN_BYPASS=true`.

## Security notes

- Admin identity comes from a verified Access JWT (signature, audience, issuer, expiry). Roles are enforced on the server for every action.
- Admin POSTs check `Origin` and `Sec-Fetch-Site`. Every page sends a nonce-based Content-Security-Policy, and there are no inline event handlers.
- Every change is recorded with the admin's email in `content_history` and `audit_log`.
- Contact details on declined or withdrawn items are erased nightly after the retention period (12 months by default).
- Submitter IPs are stored only as salted hashes, for rate limiting. Set `IP_HASH_SALT` as a secret to use your own salt.

## Known gaps / next steps

- The logo is hotlinked from Blogger. Move it into the Worker or R2.
- Imported Fall 2026 guests have no contact details. Add them on each item's page so schedule emails can list them.
- Ideas for later: emailing submitters when they're approved or declined, uploading audio for past shows, and drag-and-drop in the layout editor.
