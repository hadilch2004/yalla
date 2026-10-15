# Yalla database

- `migrations/001_schema.sql` creates everything. Run it once in the Supabase SQL Editor (see ../SETUP-SUPABASE.md).
- `dev-reset.sql` erases it all (development only).
- `tests/run-tests.sh` loads the schema into a throwaway local Postgres and runs 230 checks as different people,
  including attempts to break the rules. Run it after every change to the schema.
- `tests/run-rest-tests.sh` puts PostgREST (the same server Supabase uses for its data API) in front of a throwaway
  Postgres and runs 73 checks through the vendored supabase-js, the way the app calls it. It also runs every query found in
  `cloud.js`, so the app and the schema cannot drift apart. It found real mistakes the SQL tests could not (reading a new
  row back, saving a location with an upsert).
- `tests/dev-stack.sh start|stop|reset` runs a throwaway backend you can point the real app at: Postgres with the real
  schema, PostgREST, and a small fake of the login and photo services (`dev-gateway.mjs`, development only). To try it, in the
  browser console on http://localhost:5173 run
  `localStorage.setItem('yalla.dev.config', JSON.stringify({supabaseUrl:'http://127.0.0.1:54397', supabaseKey:'dev', realtime:false, dev:true}))`
  and reload. Remove that key to go back to the demo. This override only works on localhost.
- `tests/run-api-tests.sh` is the same plus login, photo storage and realtime, against the full local Supabase stack
  (`npx supabase start`, needs Docker with working internet access). It has not been run yet.

## What the database enforces (so a modified app cannot get around it)

| Rule | How |
|---|---|
| Ghost mode is the default. Nobody sees your location or your event joins until you opt in | `profiles.share_loc = false`; location and attendee rules check it; turning it on removes your stored position |
| Location only for **mutual** besties, only while not expired (8 h max), only within 3 km of campus | `locations` policy + `locations_guard` trigger |
| Blocked people cannot see, message, join or locate you, in either direction. They never learn they were blocked | `is_blocked()` in every policy; `blocks` readable only by the blocker |
| Club events only for followers of the host club or an accepted co-host | `can_see_hangout_row()` |
| Clubs never join events. Several heads can run one club from their own accounts | `members_before_insert`, `can_manage_club()` |
| Community chat and ideas for accepted members only; followers read the news | `is_community_member()`, `in_community()` |
| Creator flag, club approval, Butterfly badge, system chat lines and notifications cannot be written by the app | column-level grants, server triggers |
| Terms and 16+ confirmation required at sign-up | `handle_new_user` trigger |
| Private settings (ghost mode, exact or spot-only, private browsing, alerts) are readable only by their owner | column-level grants, `my_settings()` |
| Deleting an account is silent and complete; reports about the person stay without their content | `delete_my_account()` |
| Reports are write-only from the app | no select grant on `reports` |
| Signed-out visitors can do nothing | no grants for `anon` |

Not enforced here yet: nothing stops someone from creating many accounts; add email verification (SETUP-SUPABASE.md, section 3).
