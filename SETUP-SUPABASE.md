# Setting up the Yalla backend (Supabase, free plan)

About 15 minutes. You do these steps yourself because they create an account in your name. Nothing here costs money.

## 1. Create the project

1. Go to **supabase.com**, click **Start your project**, and sign in (signing in with GitHub is the easiest).
2. **New project**. Name it `yalla`. Pick the **Free** plan.
3. **Database password**: click *Generate a password* and store it in a password manager.
   **Never send this password to anyone, including me.** Yalla does not need it.
4. **Region**: choose the one closest to Morocco, for example *Central EU (Frankfurt)* or *West EU (Paris)*. You cannot change it later.
5. Click **Create new project** and wait about two minutes.

## 2. Create the tables and the security rules

1. Left menu: **SQL Editor** → **New query**.
2. Open `supabase/migrations/001_schema.sql` from this folder, copy everything, paste it, click **Run**.
3. You should see *Success. No rows returned*. If you see a red error, copy it to me.

This creates every table plus the rules that decide who can read and write what (ghost mode, mutual besties only,
blocking, club permissions, silent account deletion). The rules were checked by 303 automated tests
(`supabase/tests`), including attempts to break them.

## 3. Sign-up and email

Supabase's built-in email sender only delivers to **members of your Supabase team**, at most **2 emails per hour**.
So real students cannot receive a verification email until you choose one of these:

| Option | Cost | What you get | Good for |
|---|---|---|---|
| **A. Switch email confirmation off** (Authentication → Sign In / Providers → Email → turn off *Confirm email*) | free | Sign-up works instantly with any address. Nothing proves the address is theirs | A pilot with friends you know |
| **B. Sign in with Google** (Authentication → Sign In / Providers → Google) | free | Google proves the Gmail address, no email needs to be sent | Public use, if you accept "Continue with Google" |
| **C. Email confirmation with your own domain** (Authentication → Emails → SMTP Settings, using Brevo or Resend) | a domain, about $10 a year | The normal "click the link" email. Brevo's free plan allows about 300 emails a day, Resend's about 100 a day. Both require a domain you own and cannot send as a gmail.com address | A proper public launch |

My suggestion: **A now** (to build and test with friends), then **B or C** before you let strangers in.
Limits and rules change, so check each provider's current pricing page.

Also set, under **Authentication → URL Configuration**: *Site URL* = the address where the app will live
(for now `http://localhost:5173`; later your https address) and add the same addresses under *Redirect URLs*.

## 4. Connect the app

Left menu: **Project Settings → API** (the page may be called *API Keys*).

- **Project URL**, like `https://abcdxyz.supabase.co`
- The **anon** key (newer projects call it the **publishable** key, starting with `sb_publishable_…`)

Put them in `config.js` in this folder (or send them to me and I will):

```js
window.YALLA_CONFIG = {
  supabaseUrl: 'https://abcdxyz.supabase.co',
  supabaseKey: 'your-anon-or-publishable-key',
};
```

Reload the app: the demo button disappears and sign-up creates real accounts. Empty values bring the demo back.

These two values are designed to be public: they ship inside the app, and the rules from step 2 are what protect your data.

**Do not send** the `service_role` key (newer projects: *secret* key), the database password, or your Supabase login.
Those give full access to everyone's data. If one ever lands in GitHub or a chat, reset it in the same settings page.

## 5. After people sign up

Day-to-day jobs, none of them needed until the situation comes up. Run SQL in the **SQL Editor** (left menu → New query).

**The Creator badge** (one account only, pinned on every screen with a "Chat with the creator" link): open
`supabase/migrations/002_creator.sql`, check the email in it is the right account, paste it into the SQL Editor and Run.
The account must have signed up first. The database refuses a second Creator.

**Approving a club** (removes "pending verification"):

```sql
update public.profiles set club_approved = true where kind = 'club' and name = 'Drama Club';
```

**Reading reports**: *Table Editor → reports*. To act on one, open *Authentication → Users* to ban the account,
and delete the offending message or post in the matching table. Apple expects you to act within about a day.

**Clearing expired live locations** (optional, you can skip it): expired positions are already hidden from everybody, and the
table holds at most one row per person, so it never grows. If you still want it tidy: *Database → Extensions* → enable
`pg_cron`, then run
`select cron.schedule('yalla-clean-locations', '*/10 * * * *', 'select public.cleanup_expired_locations()');`

## 6. What the free plan means

- Database 500 MB and 1 GB of photos are plenty for a campus pilot. Check the current numbers on Supabase's pricing page.
- A free project **pauses after about 7 days without activity**. Open the dashboard and click *Restore*. A pilot used daily never pauses.
- The free plan has **no automatic backups**. Export your data now and then (*Database → Backups* or `pg_dump`).
- **Never run `supabase/dev-reset.sql` on your real project once anybody has signed up.** It deletes every table and all the
  people's data. It exists only for a throwaway project while developing (reset, then run `001_schema.sql` again).

## Security notes

- The anon key is safe to publish **because every table has row level security**. Never turn it off on a table.
- Photos are stored in two public buckets (`avatars`, `gallery`). Anyone with a photo's link can open it.
  Do not store anything private there.
- The tests live in `supabase/tests`. Run them after any change to the rules: `./supabase/tests/run-tests.sh` and
  `./supabase/tests/run-rest-tests.sh` (they need Postgres and PostgREST installed locally with Homebrew, use a temporary
  copy and touch nothing else).
