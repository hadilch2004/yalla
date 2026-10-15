# Status (updated 13 Oct 2026)

The prototype is feature complete for a first pilot, except for the backend. See README.md for what works and what is mocked,
and LAUNCH.md for how to ship it.

Done in the latest round:
- Removed the AUI name and the email-domain rule: any email works
- Free map: OpenFreeMap vector tiles (OpenStreetMap data), no account or key, with plain OpenStreetMap tiles as a fallback
- "Who viewed your profile" list (with private browsing) replaces the stalking notification
- Report and block, community guidelines, support contact, 16+ and terms checkbox, privacy and terms templates
- Installable web app: manifest, icons, offline service worker (works on iPhone via Safari, Add to Home Screen)

Tested in the browser by script and by eye: Gmail sign-up, the terms checkbox, visitors list, report and block, account
deletion (no traces left), service worker and manifest, and a sweep of about 200 screens for three account types with no errors.

## Not verified

- A real iPhone, other browsers, real camera or selfie capture. Live location was tested with a fake GPS walking around campus
  (throttling, accuracy, leaving campus, spot-only, expiry, permission denied, backgrounding), not with a real phone's GPS
- Push notifications (not built; needs a backend)
- The free map's usage limits at scale (OpenFreeMap and OpenStreetMap ask for fair use; check their current terms before a big launch)

## Ideas

- **Bump to connect**: see the notes in the chat. Needs the backend. A QR code or short code is a simpler first version

## Backend

Done and tested:
- The database (`supabase/migrations/001_schema.sql`): tables, row level security, column locks, silent account deletion,
  photo storage rules, realtime. 230 database checks and 73 API checks, all passing (`./supabase/tests/`).
- The app side (`cloud.js` plus the `CLOUD` branches in `app.js`): sign-up, login, logout, password reset, profile and
  photo, hangouts, group and private chat, besties, ghost mode and live location, profile visitors, report and block,
  clubs (follow, join requests, community chat, news, ideas, gallery, heads, co-hosting), silent account deletion.
  Driven through the real UI in a browser against a local test backend (`./supabase/tests/dev-stack.sh start`).
- Demo mode is unchanged and still works when `config.js` is empty.

Not checked yet, because it needs a real Supabase project (Docker's network is blocked on this Mac, so a full local stack
was not possible): the real login service (email confirmation, rate limits), real photo storage rules, realtime, and the
free plan's limits in practice.

Waiting for you: create the Supabase project (`SETUP-SUPABASE.md`), put its URL and anon/publishable key in `config.js`,
then run through the app once with two phones. Send me anything that looks off.

## Next (in order)

1. **First run on a real Supabase project.** Email: free options are in SETUP-SUPABASE.md, section 3
2. **Moderation dashboard** over the `reports` table, and a real support email
3. Remove demo content (demo button, simulated students, sample clubs) and decide who approves clubs
4. Fill the `[brackets]` in `privacy.html` / `terms.html`, set `BRAND.support`, have them reviewed
5. Host it free (see LAUNCH.md), pilot with a few clubs, then decide about the App Store ($99 a year)

`wip/` holds old snapshots from before the map rebuild. It is safe to delete.
