-- Makes ONE account the Creator: the single account with the ✔ badge, pinned on every main screen with a
-- "Chat with the creator" link. The app can never set this flag, only you can, here.
--
-- Run it once in Supabase: SQL Editor -> New query -> paste -> Run, AFTER the account has signed up in the app.
-- To change who the Creator is later, edit the email and run it again (the old one loses the badge).

-- the database itself refuses a second Creator
create unique index if not exists profiles_one_creator_idx on public.profiles ((true)) where is_creator;

update public.profiles set is_creator = false where is_creator;
update public.profiles set is_creator = true
 where id = (select id from auth.users where email = 'hadilch2004@gmail.com');

-- check: this should show exactly one row, with your email
select p.name, u.email, p.is_creator
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.is_creator;
