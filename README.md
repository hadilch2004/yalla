# Yalla: hang out on campus (prototype)

Make a plan, let others join, chat in the group, meet new people. Clubs run communities and post events for their followers.

- **Try it:** `python3 serve.py`, then open http://localhost:5173 (best at phone width). No build step.
- **Install it on an iPhone for free:** see [LAUNCH.md](LAUNCH.md). It is an installable web app (PWA), no App Store needed.
- **Two modes.** With `config.js` empty (the default) it is a **demo**: all data lives in one browser and simulated students
  move around. With a Supabase project URL and key in `config.js` it becomes the **real app**: real accounts, shared data
  between phones, live chat and live locations, all protected by the database rules in `supabase/`.
  Setup: [SETUP-SUPABASE.md](SETUP-SUPABASE.md). The demo keeps working as it always did.
- **Status:** the real mode is built and was tested end to end in a browser against a local copy of the database rules
  (sign-up, login, password reset, profile and photo, hangouts, group and private chat, besties, live location, ghost mode,
  clubs, communities, heads, co-hosting, blocking, reports, silent account deletion). It has not run on a real Supabase
  project yet: that needs your project and its keys.

In demo mode, sign up with any email address or use **Try the demo account** (its login is in the `DEMO` constant in `app.js`).
In real mode there is no demo button.

## What works

**Map (home screen)**, free OpenStreetMap-based tiles (OpenFreeMap), no account or key
- Colour-coded spot pins, hangouts as bigger pins with the attendee count, besties and you as avatar rings (Bump style)
- **Exact positions**: besties walk around live with a dotted trail, events sit at the exact point they were pinned.
  Tap the map to pin an event or to drop a pin for yourself. Drag the map, zoom with + / −
- Halo avatars, **LIVE** badges, status bubbles, 🌙 for idle friends, group bubbles, a blue route and "Arrive in 2 min"
  card for a bestie, and a hex **scratch map** that clears around places you have been
- Drag-up bottom sheet (map only / peek / half / full), floating search, activity filters, big place headline

**People**
- Email + password. In real mode: "Forgot your password?" on the login screen, and **Change password** in the Me tab. Photos, not emoji: upload one or take a selfie, otherwise you get your initial on a colour
- Major, year, 🎓 Alumni after graduation, favourite spots, a funny "Yalla take" on your profile (remix, hide, clear history)
- **Who viewed your profile**: a list in *Me* with the time and visit count. *Private browsing* hides you from other people's
  lists, and then you cannot see your own either
- Ghost mode (the default) hides where you are **and** which events you join. Sharing is opt-in, mutual, with an option
  to share only the campus spot instead of your exact position
- **📡 Live location**: the phone's GPS follows you on the map while the app is open (see the limits below). It only works on and
  near campus, you pick 1, 4 or 8 hours and it stops by itself, then you are back in ghost mode. Leaving campus hides you.
  Very rough fixes are ignored, and standing still sends nothing. Exact or spot-only sharing
- "Friend nearby 📍" and "bestie is going 🙌" notifications
- **Creator** account (Hadil) with the one ✔ Creator badge, pinned on every main screen. 🦋 **Butterfly** badge for people
  who meet lots of people *and* use the app regularly. Everyone else has no badge

**Clubs**
- Sign-up asks first: student or club. Different forms, a different colour world (pink / orange), different tabs
- Clubs **create events, they never join them**. Events are visible only to followers (and co-hosting clubs' followers)
- **Community** per club: News for followers; Chat, Ideas (suggestions with votes) and the member list for **accepted
  members** only. ⭐ **Heads** (the owners, with roles) run it, several people can run one club
- Club profile with tagline, summary, meeting time, photo gallery. Clubs can **collaborate** on events
- Pending verification badge until the team approves a club

**Safety (what app stores require)**
- **Report** a person, message, event or club, and **block** people. Blocked people cannot message you, see you on the map,
  or view your profile, and their messages are hidden
- Community guidelines, support contact, privacy policy and terms (templates in `privacy.html` / `terms.html`)
- 16+ confirmation and terms checkbox at sign-up
- **Delete my account** (students and clubs): removes the profile, photos, location history, chats, memberships,
  visitors, notifications. Events you host are cancelled. Reports about you stay for safety, without the content
- **Deleting is silent**: nobody is notified. Besties, followers and group members just stop seeing the account, and no
  "left" or "deleted" message appears anywhere

**Hangouts and chat**: start a hangout, join it, group chat, private chats, stickers, ranks and tiers, "Picked for you"
recommendations that learn your taste, and notifications.

## Demo mode versus real mode

| | Demo (no keys in `config.js`) | Real (Supabase keys in `config.js`) |
|---|---|---|
| Data | `localStorage`, one browser | A Supabase database shared by everyone, with row level security |
| Login | Passwords hashed in the browser | Supabase Auth: password login, password reset by email, optional email confirmation |
| People | Seeded students chat, walk around, view your profile | Real people |
| Chat and positions | Simulated | Real, with live updates (realtime where available, otherwise a 5 second refresh) |
| Photos | Embedded in the page data | Stored files with public links (profile pictures, club logos and galleries) |
| Notifications | In-app, simulated | Created by the database (bestie requests, "bestie is going", club requests, co-host invites, new followers, ideas) |
| Club approval, Creator badge, Butterfly badge | Flags | Set only on the server |
| Reports | Saved in the browser | A table you read in the Supabase dashboard |

Still to do for real mode: push notifications (when the app is closed), a moderation dashboard, and the things in
[NEXT-STEPS.md](NEXT-STEPS.md). Placeholders to replace: `support@example.com` and the `[brackets]` in the policy pages.

## Live location: what a web app can and cannot do

- Works only while Yalla is **open and on screen**. iPhone Safari and installed web apps pause GPS when you lock the phone or
  switch apps. The app pauses and resumes the watch for you, and others see "last seen" times
- Needs the secure **https** address. The Wi-Fi test link (`http://`) cannot use GPS. Use "Drop a pin" there
- True background tracking (positions while the phone is in your pocket) needs a native iPhone app with "Always" location
  permission, which costs battery, gets extra App Review scrutiny and needs the paid Apple account. Start without it

## Free stack and licences

- Map tiles: [OpenFreeMap](https://openfreemap.org) (free, no key). Data © OpenStreetMap contributors (ODbL). Fallback: plain OpenStreetMap tiles.
  The place names on the map come from OpenStreetMap. Change `MAP_STYLE` in `app.js` for a different look
- Libraries in `vendor/` (see `vendor/README.md`): Leaflet 1.9.4, MapLibre GL JS 5.24.0, maplibre-gl-leaflet 0.1.3
- Fonts: Nunito and Anton from Google Fonts (host them yourself if you want no third-party requests)
- Place coordinates come from OpenStreetMap plus a few approximate points. The sample clubs and students are placeholders

## Files

`index.html`, `styles.css`, `app.js` (the app) · `manifest.webmanifest`, `sw.js`, `icons/` (install on a phone, work offline) ·
`config.js` (backend keys) · `cloud.js` (the real-mode layer) · `privacy.html`, `terms.html` · `vendor/` ·
`serve.py` (dev server, caching off) · `supabase/` (database, tests, local test backend) ·
`SETUP-SUPABASE.md` · `LAUNCH.md` · `NEXT-STEPS.md` ·
`wip/` (old snapshots, safe to delete)
