# Launching Yalla

Three stages. The first two are free. The third is the only one that costs money.

## Stage 1: put it online for free (and installable on iPhones)

Yalla is a PWA: it installs from Safari like an app (own icon, full screen, works offline), with no App Store and no fee.
Putting it online also gives it the secure **https** address that live GPS needs.

1. **Build the upload folder:** `./scripts/make-deploy-folder.sh`. It creates `deploy/` with only what the app needs (no
   database files, tests or notes) and stops if it finds a secret key in there.
2. **Upload it to Cloudflare Pages** (free, no credit pool, sites do not sleep): sign up at dash.cloudflare.com, then
   *Workers & Pages → Create → Pages → Upload assets*, name the project `yalla`, drag the `deploy` folder in, and click Deploy.
   You get an address like `https://yalla-xxxx.pages.dev`. (Netlify Drop works too, but its free plan runs on monthly
   "credits" and pauses your sites when they run out.)
3. **Tell Supabase the address:** *Authentication → URL Configuration*: set **Site URL** to your new address and add it under
   **Redirect URLs**. This makes the "forgot password" link come back to the right place.
4. **On an iPhone:** open the address in **Safari**, tap **Share**, then **Add to Home Screen**.
5. **To update later:** run the script again and upload the folder again (or connect the GitHub repository to Cloudflare so
   every push updates the site by itself).

Before you share the address widely: set your real support email (`BRAND.support` in `app.js`) and fill the `[brackets]`
in `privacy.html` and `terms.html`. Those pages are public and linked from the sign-up form.

## Stage 2: make it real (still free)

What it takes for people to really see each other's events, chats and locations, and where each piece stands:

| Piece | Status |
|---|---|
| A backend: **Supabase** free plan (Postgres, login, live updates, photo storage). Free projects can pause when unused | Built. You create the project |
| Real **email verification** at sign-up | The app handles it. Turning it on needs an email sender (see SETUP-SUPABASE.md, section 3) |
| **Server-side rules**: who sees which event, ghost mode, club permissions, community membership, blocking, badges | Built and tested (230 checks) |
| **Live location sharing**: positions go to a `locations` table, mutual besties receive them, old ones expire | Built (the foreground limit of a web app still applies, see README) |
| **Account deletion kept silent** on the server | Built and tested |
| Demo content removed in real mode (no demo button, simulated students, sample clubs) | Done |
| A **moderation dashboard** over the `reports` table, and a promise to act quickly | Reports are readable in the Supabase dashboard. A proper page is still to do |
| **Push notifications** (iPhone web apps support them from iOS 16.4 once added to the Home Screen) | Not built |

The database side and the app side are written and tested against a local copy of the database rules: see `supabase/`,
[SETUP-SUPABASE.md](SETUP-SUPABASE.md) and `cloud.js`. What is left for you: create the free Supabase project (about 15
minutes), put its URL and anon/publishable key in `config.js`, and run through the app once with two phones. I will never
need your account password, your database password or the service_role key.

When you host the app, upload only the app files (`index.html`, `app.js`, `cloud.js`, `config.js`, `styles.css`, `sw.js`,
`manifest.webmanifest`, `icons/`, `vendor/`, `logo.svg`, `privacy.html`, `terms.html`). Leave `supabase/` and the markdown
files out. Use a **private** GitHub repository if you like: Netlify and Cloudflare Pages deploy from private repositories
for free, and they give you the https address live GPS needs.

## Getting it onto phones: what each option costs

| Phone | Free | Paid |
|---|---|---|
| **iPhone** | Open the web address in Safari once, then Share → **Add to Home Screen**. It becomes an app icon, opens full screen and works offline. Yalla shows an "Get the Yalla app" card that explains this. | **$99 a year** (Apple Developer): App Store, or TestFlight with a public invite link. Apple has no way to install a native app from a website outside the EU, and Morocco is not in the EU. |
| **Android** | The same install from Chrome (an "Install" button appears). A native `.apk` file people download and tap can also be built for free (needs the Android tools on this Mac, about 3-5 GB). | **$25 once** for Google Play. |

A native app (App Store, Play Store, `.apk`) is the same web app wrapped with Capacitor, so everything built so far carries over.

## Stage 3: the App Store (costs money)

There is **no free way** onto the App Store. The Apple Developer Program costs **$99 a year** (waived only for registered
nonprofits, schools and governments). You also need a Mac with Xcode 26 or newer, your Apple ID, identity verification and
Apple's agreements. Only you can do those steps.

If you decide to pay later:

1. Finish Stage 2 first. An app that does not work between users gets rejected.
2. Wrap the web app with **Capacitor** (free). It adds native camera, location and push.
3. Create the app in App Store Connect: name, icon (`icons/icon-1024.png`), screenshots, description, support URL,
   privacy policy URL, age rating, App Privacy answers.
4. Test with **TestFlight**, then submit. Review usually takes a day or two.
5. Give App Review a working test login, because they cannot sign up with your sign-up rules.

### Apple review checklist

| Apple wants | Status |
|---|---|
| Report content and people, block people, moderation, contact details (apps with user content) | Built (report, block, guidelines, support email). Needs a real moderation process |
| Delete account inside the app | Built |
| Privacy policy and terms | Templates written, you must complete them |
| Privacy labels and a permission reason for location | To do at submission |
| Age rating (location sharing and chat between users) | To do. The app asks for 16+ |
| An app that works, not placeholders and demo data | Real mode is built. Needs your Supabase project, then a pilot |
| Not just a website in a box | Capacitor with native location, camera and push helps |
| No misuse of other companies' names | The AUI name is gone from the app. Map labels come from OpenStreetMap |

Rules change, so check Apple's current App Review Guidelines before you submit.
