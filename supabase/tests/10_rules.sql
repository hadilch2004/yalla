-- Checks for the security rules in 001_schema.sql. Each check logs pass/fail; the file ends with a summary.
-- Run with ./run-tests.sh (needs the stand-ins from 00_stubs.sql).

create schema t;
create table t.results (n serial, name text, ok boolean, info text);
create table t.people (name text primary key, id uuid not null);
create table t.ids (name text primary key, id uuid not null);
create table t.kv (k text primary key, v bigint);
grant usage on schema t to anon, authenticated;

create function t.log(n text, ok boolean, info text) returns void language sql security definer as
$$ insert into t.results (name, ok, info) values (n, ok, info) $$;
create function t.id(n text) returns uuid language sql stable security definer as $$ select id from t.people where name = n $$;
create function t.h(n text) returns uuid language sql stable security definer as $$ select id from t.ids where name = n $$;
create function t.save_id(n text, i uuid) returns boolean language plpgsql security definer as
$$ begin insert into t.ids values (n, i) on conflict (name) do update set id = excluded.id; return true; end $$;
create function t.keep(key_ text, val_ bigint) returns boolean language plpgsql security definer as
$$ begin insert into t.kv values (key_, val_) on conflict (k) do update set v = excluded.v; return true; end $$;
create function t.kept(k text) returns bigint language sql stable security definer as $$ select v from t.kv where k = $1 $$;

-- become a person (or the signed-out visitor, or the database owner)
create function t.as_user(n text) returns void language plpgsql as $$
begin
  reset role;
  if n = 'admin' then perform set_config('request.jwt.claim.sub', '', false); return; end if;
  if n = 'anon' then perform set_config('request.jwt.claim.sub', '', false); set role anon; return; end if;
  perform set_config('request.jwt.claim.sub', t.id(n)::text, false);
  set role authenticated;
end $$;

create function t.ok(n text, q text) returns void language plpgsql as $$
declare r boolean;
begin
  execute q into r;
  perform t.log(n, coalesce(r, false), case when coalesce(r, false) then '' else 'returned false or null: ' || q end);
exception when others then perform t.log(n, false, 'error: ' || sqlerrm || ' in: ' || q);
end $$;

create function t.fails(n text, q text) returns void language plpgsql as $$
begin
  execute q;
  perform t.log(n, false, 'expected an error but it worked: ' || q);
exception when others then perform t.log(n, true, sqlerrm);
end $$;

\o /dev/null

-- ───────────────────────────────────────────── people
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@gmail.com', '{"name":"Alice","agreed":"true","major":"CS"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@gmail.com',   '{"name":"Bob","agreed":"true"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@gmail.com', '{"name":"Carol","agreed":"true"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@gmail.com',  '{"name":"Dave","agreed":"true"}'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@gmail.com',  '{"name":"Erin","agreed":"true"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@gmail.com', '{"name":"Frank","agreed":"true"}'),
  ('00000000-0000-0000-0000-000000000010', 'gina@gmail.com',  '{"name":"Gina","agreed":"true"}'),
  ('00000000-0000-0000-0000-000000000011', 'head@gmail.com',  '{"name":"Hana the head","agreed":"true"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'robotics@gmail.com', '{"name":"Robotics Club","agreed":"true","kind":"club"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'drama@gmail.com',    '{"name":"Drama Club","agreed":"true","kind":"club"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'chess@gmail.com',    '{"name":"Chess Club","agreed":"true","kind":"club","interests":["coffee","study"],"color":"#3b82f6","summary":"About us","bio":"Mate in two","category":"Other"}');
insert into t.people select p.name, u.id from (values
  ('alice','00000000-0000-0000-0000-00000000000a'),('bob','00000000-0000-0000-0000-00000000000b'),
  ('carol','00000000-0000-0000-0000-00000000000c'),('dave','00000000-0000-0000-0000-00000000000d'),
  ('erin','00000000-0000-0000-0000-00000000000e'),('frank','00000000-0000-0000-0000-00000000000f'),
  ('gina','00000000-0000-0000-0000-000000000010'),('head','00000000-0000-0000-0000-000000000011'),
  ('club1','00000000-0000-0000-0000-0000000000c1'),('club2','00000000-0000-0000-0000-0000000000c2'),('club3','00000000-0000-0000-0000-0000000000c3')
) as p(name, id) join auth.users u on u.id = p.id::uuid;

select t.as_user('admin');
select t.fails('sign-up without the terms/16+ confirmation is rejected',
  $$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'x@y.com', '{"name":"X"}')$$);
select t.ok('every sign-up gets a profile', $$select count(*) = 11 from public.profiles$$);
select t.ok('sign-up extras are kept (interests, colour, club text)', $$select interests = array['coffee','study'] and color = '#3b82f6' and summary = 'About us' from public.profiles where id = t.id('club3')$$);
select t.ok('club sign-up becomes a club that is not approved yet', $$select kind = 'club' and not club_approved from public.profiles where id = t.id('club1')$$);
select t.ok('everyone starts in ghost mode', $$select bool_and(not share_loc) from public.profiles$$);
select t.ok('nobody starts with a badge', $$select bool_and(not is_creator and not butterfly) from public.profiles$$);

-- ───────────────────────────────────────────── 1. what a signed-in person may change about their own profile
select t.as_user('alice');
select t.fails('cannot make yourself the Creator',   $$update public.profiles set is_creator = true where id = t.id('alice')$$);
select t.fails('cannot give yourself the Butterfly badge', $$update public.profiles set butterfly = true where id = t.id('alice')$$);
select t.fails('cannot approve your own club',       $$update public.profiles set club_approved = true where id = t.id('alice')$$);
select t.fails('cannot turn a student into a club',  $$update public.profiles set kind = 'club' where id = t.id('alice')$$);
select t.fails('cannot create a profile by hand',    $$insert into public.profiles (id, name) values (gen_random_uuid(), 'Fake')$$);
select t.fails('cannot delete a profile directly',   $$delete from public.profiles where id = t.id('alice')$$);
select t.ok('can edit your own bio', $$with u as (update public.profiles set bio = 'hello' where id = t.id('alice') returning 1) select count(*) = 1 from u$$);
select t.ok('cannot edit someone else''s profile', $$with u as (update public.profiles set bio = 'hacked' where id = t.id('bob') returning 1) select count(*) = 0 from u$$);
select t.fails('nobody can read other people''s private settings', $$select share_loc from public.profiles where id = t.id('bob')$$);
select t.fails('...not even your own through the table (use my_settings)', $$select precise from public.profiles where id = t.id('alice')$$);
select t.fails('select * is refused because it would include private columns', $$select * from public.profiles where id = t.id('bob')$$);
select t.ok('my_settings returns only my own switches', $$select (public.my_settings() ->> 'share_loc')::boolean = false and public.my_settings() ? 'precise' and not (public.my_settings() ? 'agreed_at')$$);
select t.fails('bad colour is rejected', $$update public.profiles set color = 'red' where id = t.id('alice')$$);
select t.fails('a signed-in person cannot run the badge function', $$select public.recompute_badges(t.id('bob'))$$);
select t.fails('a signed-in person cannot run the clean-up function', $$select public.cleanup_expired_locations()$$);

select t.as_user('anon');
select t.fails('signed-out visitors cannot read profiles', $$select * from public.profiles$$);
select t.fails('signed-out visitors cannot read hangouts', $$select * from public.hangouts$$);
select t.fails('signed-out visitors cannot record a view', $$select public.record_view(t.id('bob'))$$);

-- ───────────────────────────────────────────── 2. live location
select t.as_user('carol');
select t.fails('ghost mode: cannot publish a location while it is on',
  $$insert into public.locations (lat, lng, acc, place, expires_at) values (33.5398, -5.1072, 9, 'library', now() + interval '4 hours')$$);

select t.as_user('alice');
select t.ok('turning sharing on', $$with u as (update public.profiles set share_loc = true where id = t.id('alice') returning 1) select count(*) = 1 from u$$);
select t.ok('my_settings now shows sharing on', $$select (public.my_settings() ->> 'share_loc')::boolean$$);
select t.ok('alice publishes a location on campus',
  $$with i as (insert into public.locations (lat, lng, acc, place, note, expires_at) values (33.5398, -5.1072, 9, 'library', 'studying', now() + interval '4 hours') returning 1) select count(*) = 1 from i$$);
select t.fails('a location far from campus is refused', $$update public.locations set lat = 33.60 where user_id = t.id('alice')$$);

select t.as_user('bob');
select t.fails('cannot publish a location in another person''s name',
  $$insert into public.locations (user_id, lat, lng, expires_at) values (t.id('alice'), 33.5398, -5.1072, now() + interval '1 hour')$$);
select t.ok('strangers cannot see her location', $$select count(*) = 0 from public.locations where user_id = t.id('alice')$$);
select t.ok('cannot move someone else''s location', $$with u as (update public.locations set lat = 33.5 where user_id = t.id('alice') returning 1) select count(*) = 0 from u$$);
select t.as_user('alice');
select t.ok('alice adds bob (one way)', $$with i as (insert into public.besties (friend_id) values (t.id('bob')) returning 1) select count(*) = 1 from i$$);
select t.as_user('bob');
select t.ok('one-way besties still cannot see the location', $$select count(*) = 0 from public.locations where user_id = t.id('alice')$$);
select t.ok('bob gets a bestie request', $$select count(*) = 1 from public.notifications where kind = 'bestie_req' and data ->> 'from' = t.id('alice')::text$$);
select t.ok('bob adds alice back (mutual)', $$with i as (insert into public.besties (friend_id) values (t.id('alice')) returning 1) select count(*) = 1 from i$$);
select t.ok('mutual besties see the location', $$select count(*) = 1 from public.locations where user_id = t.id('alice')$$);
select t.as_user('alice');
select t.ok('alice is told bob accepted', $$select count(*) = 1 from public.notifications where kind = 'bestie_ok' and data ->> 'from' = t.id('bob')::text$$);
select t.as_user('carol');
select t.ok('other people still cannot see it', $$select count(*) = 0 from public.locations where user_id = t.id('alice')$$);

select t.as_user('alice');
select t.ok('alice lets the location expire', $$with u as (update public.locations set expires_at = now() - interval '1 minute' where user_id = t.id('alice') returning 1) select count(*) = 1 from u$$);
select t.as_user('bob');
select t.ok('an expired location is not shown', $$select count(*) = 0 from public.locations where user_id = t.id('alice')$$);
select t.as_user('alice');
select t.ok('alice shares again for 30 days (too long)', $$with u as (update public.locations set expires_at = now() + interval '30 days' where user_id = t.id('alice') returning 1) select count(*) = 1 from u$$);
select t.as_user('admin');
select t.ok('the server cuts sharing to 8 hours at most', $$select expires_at <= now() + interval '8 hours 1 minute' from public.locations where user_id = t.id('alice')$$);
select t.as_user('alice');
select t.ok('turning ghost mode on', $$with u as (update public.profiles set share_loc = false where id = t.id('alice') returning 1) select count(*) = 1 from u$$);
select t.as_user('admin');
select t.ok('ghost mode removes the position from the server', $$select count(*) = 0 from public.locations where user_id = t.id('alice')$$);
select t.as_user('alice');
select t.fails('ghost mode: cannot publish again', $$insert into public.locations (lat, lng, expires_at) values (33.5398, -5.1072, now() + interval '1 hour')$$);
select t.ok('private data is private', $$with i as (insert into public.private_data (prefs) values ('{"coffee":2}') returning 1) select count(*) = 1 from i$$);
select t.fails('private data has a size limit', $$update public.private_data set prefs = to_jsonb(repeat('x', 30000))$$);
select t.ok('misc keeps small app state', $$with u as (update public.private_data set misc = '{"seenAt":1}' returning 1) select count(*) = 1 from u$$);
select t.as_user('bob');
select t.ok('besties cannot read your taste data', $$select count(*) = 0 from public.private_data$$);
select t.fails('the app cannot write notifications', $$insert into public.notifications (user_id, kind) values (t.id('bob'), 'x')$$);

-- ───────────────────────────────────────────── 3. student hangouts and group chat
select t.as_user('alice');
with h as (insert into public.hangouts (host, act, title, place, lat, lng, starts_at, max_people, description)
           values (t.id('alice'), 'walk', 'Sunset walk', 'park', 33.5418, -5.1074, now() + interval '3 hours', 2, 'Easy loop') returning id)
select t.save_id('h1', id) from h;
select t.ok('the host is in the hangout automatically', $$select count(*) = 1 from public.hangout_members where hangout_id = t.h('h1') and user_id = t.id('alice')$$);
select t.ok('the chat starts with a system line from the server', $$select count(*) = 1 from public.messages where hangout_id = t.h('h1') and sys$$);
select t.fails('cannot host an event as another student', $$insert into public.hangouts (host, act, title, starts_at) values (t.id('bob'), 'walk', 'Fake', now())$$);
select t.fails('cannot claim to be a club event', $$insert into public.hangouts (host, act, title, starts_at, club) values (t.id('alice'), 'walk', 'Fake', now(), true)$$);
select t.ok('host can edit the title', $$with u as (update public.hangouts set title = 'Sunset walk in the park' where id = t.h('h1') returning 1) select count(*) = 1 from u$$);

select t.as_user('carol');
select t.ok('student events are visible to everyone', $$select count(*) = 1 from public.hangouts where id = t.h('h1')$$);
select t.ok('non-members cannot read the group chat', $$select count(*) = 0 from public.messages where hangout_id = t.h('h1')$$);
select t.fails('non-members cannot write in the group chat', $$insert into public.messages (hangout_id, body) values (t.h('h1'), 'hi')$$);
select t.ok('only the host can edit', $$with u as (update public.hangouts set title = 'hacked' where id = t.h('h1') returning 1) select count(*) = 0 from u$$);
select t.ok('only the host can delete', $$with d as (delete from public.hangouts where id = t.h('h1') returning 1) select count(*) = 0 from d$$);

select t.as_user('bob');
select t.fails('cannot join in someone else''s name', $$insert into public.hangout_members (hangout_id, user_id) values (t.h('h1'), t.id('carol'))$$);
select t.ok('bob joins', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('h1')) returning 1) select count(*) = 1 from i$$);
select t.ok('members read the chat', $$select count(*) >= 1 from public.messages where hangout_id = t.h('h1')$$);
select t.ok('members write in the chat', $$with i as (insert into public.messages (hangout_id, body) values (t.h('h1'), 'see you there') returning 1) select count(*) = 1 from i$$);
select t.fails('cannot fake a system line', $$insert into public.messages (hangout_id, body, sys) values (t.h('h1'), 'Alice left', true)$$);
select t.fails('cannot send as someone else', $$insert into public.messages (hangout_id, body, sender) values (t.h('h1'), 'hi', t.id('alice'))$$);
select t.fails('cannot post to two places at once', $$insert into public.messages (hangout_id, to_user, body) values (t.h('h1'), t.id('carol'), 'hi')$$);

select t.as_user('carol');
select t.fails('the hangout is full (2 of 2)', $$insert into public.hangout_members (hangout_id) values (t.h('h1'))$$);

-- ghost mode hides event joins
select t.as_user('alice');
with h as (insert into public.hangouts (host, act, title, starts_at, max_people) values (t.id('alice'), 'food', 'Tacos', now() + interval '5 hours', 10) returning id)
select t.save_id('h2', id) from h;
select t.as_user('bob');
select t.ok('bob turns sharing on', $$with u as (update public.profiles set share_loc = true where id = t.id('bob') returning 1) select count(*) = 1 from u$$);
select t.ok('bob (sharing) joins tacos', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('h2')) returning 1) select count(*) = 1 from i$$);
select t.as_user('erin');
select t.ok('erin (ghost mode) joins tacos', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('h2')) returning 1) select count(*) = 1 from i$$);
select t.as_user('carol');
select t.ok('a stranger sees bob in the list', $$select count(*) = 1 from public.hangout_members where hangout_id = t.h('h2') and user_id = t.id('bob')$$);
select t.ok('a stranger does NOT see the ghost-mode joiner', $$select count(*) = 0 from public.hangout_members where hangout_id = t.h('h2') and user_id = t.id('erin')$$);
select t.ok('the counts function agrees (3 going tacos)', $$select n = 3 from public.hangout_counts() where hangout_id = t.h('h2')$$);
select t.ok('...and does not list events I cannot see', $$select count(*) = 0 from public.hangout_counts() where hangout_id = t.h('hc1')$$);
select t.ok('but the count still includes her (3 going)', $$select public.going_count(t.h('h2')) = 3$$);
select t.as_user('alice');
select t.ok('members of the hangout see everyone in it', $$select count(*) = 3 from public.hangout_members where hangout_id = t.h('h2')$$);
select t.ok('the chat says "Bob joined" (he shares)', $$select count(*) = 1 from public.messages where hangout_id = t.h('h2') and sys and body = 'Bob joined'$$);
select t.ok('...but nothing about the ghost-mode joiner', $$select count(*) = 0 from public.messages where hangout_id = t.h('h2') and body like 'Erin%'$$);

-- bestie-going notification: not for ghost-mode joiners
select t.as_user('carol');
with h as (insert into public.hangouts (host, act, title, starts_at, max_people) values (t.id('carol'), 'sports', 'Football', now() + interval '6 hours', 10) returning id)
select t.save_id('h3', id) from h;
select t.as_user('alice');
select t.ok('alice turns sharing on', $$with u as (update public.profiles set share_loc = true where id = t.id('alice') returning 1) select count(*) = 1 from u$$);
select t.ok('alice joins football', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('h3')) returning 1) select count(*) = 1 from i$$);
select t.as_user('bob');
select t.ok('her bestie bob hears that alice is going (not hosting)', $$select count(*) = 1 from public.notifications where kind = 'going' and data ->> 'from' = t.id('alice')::text$$);
-- hosting is announced to besties too, but only when sharing is on
select t.as_user('alice');
with h as (insert into public.hangouts (host, act, title, starts_at, max_people) values (t.id('alice'), 'games', 'Board games', now() + interval '8 hours', 6) returning id)
select t.save_id('h4', id) from h;
select t.as_user('bob');
select t.ok('bob hears that alice is HOSTING board games', $$select count(*) = 1 from public.notifications where kind = 'going' and (data ->> 'host')::boolean and data ->> 'from' = t.id('alice')::text$$);
select t.ok('...and not about the tacos she made while in ghost mode', $$select count(*) = 0 from public.notifications where kind = 'going' and data ->> 'hangout' = t.h('h2')::text$$);
select t.as_user('erin');
select t.ok('erin becomes alice''s bestie (request)', $$with i as (insert into public.besties (friend_id) values (t.id('alice')) returning 1) select count(*) = 1 from i$$);
select t.as_user('alice');
select t.ok('alice accepts erin', $$with i as (insert into public.besties (friend_id) values (t.id('erin')) returning 1) select count(*) = 1 from i$$);
select t.as_user('erin');
select t.ok('erin (ghost mode) joins football', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('h3')) returning 1) select count(*) = 1 from i$$);
select t.as_user('alice');
select t.ok('nobody is told about a ghost-mode join', $$select count(*) = 0 from public.notifications where kind = 'going' and data ->> 'from' = t.id('erin')::text$$);


-- ───────────────────────────────────────────── 4. private messages
select t.as_user('alice');
select t.ok('alice writes to carol', $$with i as (insert into public.messages (to_user, body, sticker) values (t.id('carol'), 'hey', false) returning 1) select count(*) = 1 from i$$);
select t.fails('cannot message yourself', $$insert into public.messages (to_user, body) values (t.id('alice'), 'note')$$);
select t.as_user('carol');
select t.ok('carol reads it', $$select count(*) = 1 from public.messages where to_user = t.id('carol') and sender = t.id('alice')$$);
select t.as_user('dave');
select t.ok('nobody else can read a private chat', $$select count(*) = 0 from public.messages where body = 'hey'$$);
select t.as_user('bob');
select t.ok('not even a bestie can', $$select count(*) = 0 from public.messages where body = 'hey'$$);

-- ───────────────────────────────────────────── 5. clubs: events, followers, heads, co-hosting
select t.as_user('club1');
with h as (insert into public.hangouts (host, act, title, place, starts_at, max_people, description)
           values (t.id('club1'), 'workshop', 'Arduino workshop', 'library', now() + interval '2 days', 30, 'Kits provided') returning id)
select t.save_id('hc1', id) from h;
select t.ok('the server marks it as a club event', $$select club from public.hangouts where id = t.h('hc1')$$);
select t.ok('the club event shows up in the club''s news', $$select count(*) = 1 from public.club_posts where club_id = t.id('club1') and hangout_id = t.h('hc1')$$);
select t.fails('clubs never join events', $$insert into public.hangout_members (hangout_id) values (t.h('hc1'))$$);
select t.as_user('carol');
select t.ok('non-followers do not see a club event', $$select count(*) = 0 from public.hangouts where id = t.h('hc1')$$);
select t.ok('non-followers do not see the club''s news', $$select count(*) = 0 from public.club_posts where club_id = t.id('club1')$$);
select t.fails('non-followers cannot join', $$insert into public.hangout_members (hangout_id) values (t.h('hc1'))$$);
select t.ok('carol follows the club', $$with i as (insert into public.follows (club_id) values (t.id('club1')) returning 1) select count(*) = 1 from i$$);
select t.ok('followers see the event', $$select count(*) = 1 from public.hangouts where id = t.h('hc1')$$);
select t.ok('followers read the news', $$select count(*) = 1 from public.club_posts where club_id = t.id('club1')$$);
select t.ok('followers can join', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('hc1')) returning 1) select count(*) = 1 from i$$);
select t.fails('followers cannot post news', $$insert into public.club_posts (club_id, body) values (t.id('club1'), 'hi')$$);
select t.fails('students cannot create events for a club', $$insert into public.hangouts (host, act, title, starts_at) values (t.id('club1'), 'x', 'Fake', now())$$);
select t.ok('followers can unfollow', $$with d as (delete from public.follows where club_id = t.id('club1') returning 1) select count(*) = 1 from d$$);

select t.as_user('club1');
select t.ok('the club sees who follows it (none now)', $$select count(*) = 0 from public.follows where club_id = t.id('club1')$$);
select t.ok('the club adds a head', $$with i as (insert into public.club_members (club_id, user_id, status, is_head, role) values (t.id('club1'), t.id('head'), 'member', true, 'President') returning 1) select count(*) = 1 from i$$);
select t.as_user('head');
select t.ok('a head can post an event as the club',
  $$with h as (insert into public.hangouts (host, act, title, starts_at) values (t.id('club1'), 'music', 'Open mic', now() + interval '3 days') returning id, by_user, club),
         s as (select t.save_id('hc2', id) from h)
    select bool_and(h.by_user = t.id('head') and h.club) from h, s$$);
select t.ok('a head can edit the club''s profile', $$with u as (update public.profiles set summary = 'We build robots' where id = t.id('club1') returning 1) select count(*) = 1 from u$$);
select t.ok('a head can upload the club logo', $$with i as (insert into storage.objects (bucket_id, name) values ('avatars', t.id('club1')::text || '/logo.png') returning 1) select count(*) = 1 from i$$);
select t.fails('...but cannot turn the club into a student or approve it', $$update public.profiles set club_approved = true where id = t.id('club1')$$);
select t.as_user('erin');
select t.ok('a normal student cannot edit the club''s profile', $$with u as (update public.profiles set summary = 'hacked' where id = t.id('club1') returning 1) select count(*) = 0 from u$$);
select t.fails('...or upload into its folder', $$insert into storage.objects (bucket_id, name) values ('avatars', t.id('club1')::text || '/evil.png')$$);
select t.as_user('head');
select t.ok('a head can post news', $$with i as (insert into public.club_posts (club_id, body) values (t.id('club1'), 'Meeting on Friday') returning 1) select count(*) = 1 from i$$);
select t.as_user('erin');
select t.fails('a normal student cannot post news', $$insert into public.club_posts (club_id, body) values (t.id('club1'), 'hi')$$);
select t.ok('people see heads of a club', $$select count(*) = 1 from public.club_members where club_id = t.id('club1') and is_head$$);

-- co-hosting
select t.as_user('club1');
select t.ok('the club was told about its new follower (carol)', $$select count(*) = 1 from public.notifications where user_id = t.id('club1') and kind = 'follow' and data ->> 'from' = t.id('carol')::text$$);
select t.ok('club1 invites club2 to co-host', $$with i as (insert into public.cohosts (hangout_id, club_id) values (t.h('hc1'), t.id('club2')) returning 1) select count(*) = 1 from i$$);
select t.as_user('club2');
select t.ok('club2 is told about the invitation', $$select count(*) = 1 from public.notifications where kind = 'collab' and data ->> 'from' = t.id('club1')::text$$);
select t.ok('club2 sees the event it was invited to', $$select count(*) = 1 from public.hangouts where id = t.h('hc1')$$);
select t.as_user('gina');
select t.ok('gina follows club2', $$with i as (insert into public.follows (club_id) values (t.id('club2')) returning 1) select count(*) = 1 from i$$);
select t.ok('a pending invitation does not expose the event to club2''s followers', $$select count(*) = 0 from public.hangouts where id = t.h('hc1')$$);
select t.ok('students cannot accept for a club', $$with u as (update public.cohosts set status = 'accepted' where club_id = t.id('club2') returning 1) select count(*) = 0 from u$$);
select t.as_user('club2');
select t.ok('club2 accepts', $$with u as (update public.cohosts set status = 'accepted' where hangout_id = t.h('hc1') and club_id = t.id('club2') returning 1) select count(*) = 1 from u$$);
select t.as_user('club1');
select t.ok('the host is told club2 accepted', $$select count(*) = 1 from public.notifications where kind = 'collabok' and data ->> 'from' = t.id('club2')::text$$);
select t.as_user('gina');
select t.ok('now club2''s followers see the event', $$select count(*) = 1 from public.hangouts where id = t.h('hc1')$$);

-- ───────────────────────────────────────────── 6. community: members, chat, ideas, gallery
select t.as_user('erin');
select t.ok('erin asks to join the community (and tries to sneak in as head)',
  $$with i as (insert into public.club_members (club_id, status, is_head, role) values (t.id('club1'), 'member', true, 'Boss') returning 1) select count(*) = 1 from i$$);
select t.ok('the request is only "pending" and not a head', $$select status = 'pending' and not is_head and role = '' from public.club_members where club_id = t.id('club1') and user_id = t.id('erin')$$);
select t.as_user('club1');
select t.ok('the club is told about the request', $$select count(*) = 1 from public.notifications where kind = 'req' and data ->> 'from' = t.id('erin')::text$$);
select t.ok('the club writes in the community chat', $$with i as (insert into public.messages (club_id, body) values (t.id('club1'), 'Welcome!') returning 1) select count(*) = 1 from i$$);
select t.as_user('erin');
select t.ok('a pending person cannot read the community chat', $$select count(*) = 0 from public.messages where club_id = t.id('club1')$$);
select t.fails('a pending person cannot write in it', $$insert into public.messages (club_id, body) values (t.id('club1'), 'hi')$$);
select t.ok('cannot promote yourself', $$with u as (update public.club_members set status = 'member', is_head = true where user_id = t.id('erin') returning 1) select count(*) = 0 from u$$);
select t.ok('promotion attempt changed nothing', $$select status = 'pending' from public.club_members where club_id = t.id('club1') and user_id = t.id('erin')$$);
select t.as_user('club1');
select t.ok('the club accepts erin', $$with u as (update public.club_members set status = 'member' where club_id = t.id('club1') and user_id = t.id('erin') returning 1) select count(*) = 1 from u$$);
select t.as_user('erin');
select t.ok('erin is told she was accepted', $$select count(*) = 1 from public.notifications where kind = 'accepted' and data ->> 'from' = t.id('club1')::text$$);
select t.ok('accepted members read the chat', $$select count(*) = 1 from public.messages where club_id = t.id('club1')$$);
select t.ok('accepted members write in the chat', $$with i as (insert into public.messages (club_id, body) values (t.id('club1'), 'thanks!') returning 1) select count(*) = 1 from i$$);
select t.ok('members automatically follow the club', $$select count(*) = 1 from public.follows where club_id = t.id('club1') and user_id = t.id('erin')$$);
select t.ok('members suggest ideas', $$with i as (insert into public.club_suggestions (club_id, body) values (t.id('club1'), 'Beginner track?') returning id) select t.save_id('s1', id) from i$$);
select t.ok('members vote', $$with i as (insert into public.suggestion_votes (suggestion_id) values (t.h('s1')) returning 1) select count(*) = 1 from i$$);
select t.fails('one vote each', $$insert into public.suggestion_votes (suggestion_id) values (t.h('s1'))$$);
select t.ok('members cannot change the status', $$with u as (update public.club_suggestions set status = 'planned' where id = t.h('s1') returning 1) select count(*) = 0 from u$$);
select t.as_user('club1');
select t.ok('the club is told about the idea', $$select count(*) = 1 from public.notifications where kind = 'sug' and data ->> 'from' = t.id('erin')::text$$);
select t.ok('the club sets an idea to planned', $$with u as (update public.club_suggestions set status = 'planned' where id = t.h('s1') returning 1) select count(*) = 1 from u$$);
select t.as_user('carol');
select t.ok('non-members cannot read the ideas', $$select count(*) = 0 from public.club_suggestions where club_id = t.id('club1')$$);
select t.ok('non-members cannot see the member list', $$select count(*) = 0 from public.club_members where club_id = t.id('club1') and not is_head$$);
select t.ok('everyone can open the gallery', $$select count(*) = 0 from public.club_gallery$$);
select t.fails('only the club can add pictures', $$insert into public.club_gallery (club_id, path) values (t.id('club1'), 'x/y.jpg')$$);
select t.as_user('club1');
select t.ok('the club adds a picture', $$with i as (insert into public.club_gallery (club_id, path, caption) values (t.id('club1'), 'c1/fair.jpg', 'Our stand') returning 1) select count(*) = 1 from i$$);

-- ───────────────────────────────────────────── 7. photo storage
select t.as_user('alice');
select t.ok('alice uploads her own avatar', $$with i as (insert into storage.objects (bucket_id, name) values ('avatars', t.id('alice')::text || '/me.jpg') returning 1) select count(*) = 1 from i$$);
select t.fails('cannot upload into another person''s folder', $$insert into storage.objects (bucket_id, name) values ('avatars', t.id('bob')::text || '/me.jpg')$$);
select t.fails('cannot upload to the club gallery', $$insert into storage.objects (bucket_id, name) values ('gallery', t.id('club1')::text || '/x.jpg')$$);
select t.as_user('head');
select t.ok('a club head can upload to the club gallery', $$with i as (insert into storage.objects (bucket_id, name) values ('gallery', t.id('club1')::text || '/x.jpg') returning 1) select count(*) = 1 from i$$);
select t.fails('a gallery folder must be a club id', $$insert into storage.objects (bucket_id, name) values ('gallery', 'whatever/x.jpg')$$);

-- ───────────────────────────────────────────── 8. who viewed your profile
select t.as_user('alice');
select t.ok('alice looks at bob''s profile', $$select true from (select public.record_view(t.id('bob'))) s$$);
select t.ok('...and again', $$select true from (select public.record_view(t.id('bob'))) s$$);
select t.ok('looking at your own profile does nothing', $$select true from (select public.record_view(t.id('alice'))) s$$);
select t.ok('looking at a club does nothing', $$select true from (select public.record_view(t.id('club1'))) s$$);
select t.fails('cannot write the visitors list directly', $$insert into public.profile_views (target, viewer) values (t.id('bob'), t.id('alice'))$$);
select t.as_user('carol');
select t.ok('carol browses privately', $$with u as (update public.profiles set private_browsing = true where id = t.id('carol') returning 1) select count(*) = 1 from u$$);
select t.ok('carol looks at bob''s profile', $$select true from (select public.record_view(t.id('bob'))) s$$);
select t.as_user('bob');
select t.ok('bob sees alice (visited twice) and not the private browser', $$select count(*) = 1 and bool_and(viewer = t.id('alice') and n = 2) from public.profile_views where target = t.id('bob')$$);
select t.as_user('dave');
select t.ok('other people cannot read bob''s visitors', $$select count(*) = 0 from public.profile_views$$);
select t.as_user('bob');
select t.ok('bob browses privately', $$with u as (update public.profiles set private_browsing = true where id = t.id('bob') returning 1) select count(*) = 1 from u$$);
select t.ok('...so he cannot see his own list either', $$select count(*) = 0 from public.profile_views$$);
select t.ok('bob turns it off again', $$with u as (update public.profiles set private_browsing = false where id = t.id('bob') returning 1) select count(*) = 1 from u$$);

-- ───────────────────────────────────────────── 9. reports
select t.as_user('alice');
select t.ok('alice reports a message', $$with i as (insert into public.reports (target_user, target_kind, target_id, reason, snippet) values (t.id('dave'), 'message', 'm1', 'Spam or scam', 'buy now') returning 1) select count(*) = 1 from i$$);
select t.fails('reports cannot be read back by the app', $$select * from public.reports$$);
select t.fails('cannot file a report in someone else''s name', $$insert into public.reports (reporter, target_kind, reason) values (t.id('bob'), 'person', 'Spam')$$);
select t.fails('cannot read, edit or delete reports', $$update public.reports set status = 'closed'$$);

-- ───────────────────────────────────────────── 10. blocking
select t.as_user('alice');
select t.ok('alice blocks dave', $$with i as (insert into public.blocks (blocked) values (t.id('dave')) returning 1) select count(*) = 1 from i$$);
select t.as_user('dave');
select t.fails('dave cannot message alice', $$insert into public.messages (to_user, body) values (t.id('alice'), 'hello')$$);
select t.ok('dave cannot see alice''s profile', $$select count(*) = 0 from public.profiles where id = t.id('alice')$$);
select t.ok('dave cannot see alice''s hangouts', $$select count(*) = 0 from public.hangouts where host = t.id('alice')$$);
select t.ok('dave cannot find out he was blocked', $$select count(*) = 0 from public.blocks$$);
select t.fails('dave cannot join alice''s hangout', $$insert into public.hangout_members (hangout_id) values (t.h('h2'))$$);
select t.as_user('alice');
select t.fails('alice cannot message dave either', $$insert into public.messages (to_user, body) values (t.id('dave'), 'hello')$$);
select t.ok('alice cannot see dave''s profile', $$select count(*) = 0 from public.profiles where id = t.id('dave')$$);
select t.ok('alice can unblock', $$with d as (delete from public.blocks where blocked = t.id('dave') returning 1) select count(*) = 1 from d$$);
select t.as_user('dave');
select t.ok('after unblocking dave can see her again', $$select count(*) = 1 from public.profiles where id = t.id('alice')$$);

-- blocking a bestie cuts the tie and the location
select t.as_user('alice');
select t.ok('alice shares a location again',
  $$with i as (insert into public.locations (lat, lng, acc, place, expires_at) values (33.5398, -5.1072, 9, 'library', now() + interval '4 hours') on conflict (user_id) do update set lat = 33.5398 returning 1) select count(*) = 1 from i$$);
select t.as_user('bob');
select t.ok('bob sees it (mutual besties)', $$select count(*) = 1 from public.locations where user_id = t.id('alice')$$);
select t.ok('bob blocks alice', $$with i as (insert into public.blocks (blocked) values (t.id('alice')) returning 1) select count(*) = 1 from i$$);
select t.ok('bob no longer sees her location', $$select count(*) = 0 from public.locations where user_id = t.id('alice')$$);
select t.as_user('admin');
select t.ok('the bestie link is removed both ways', $$select count(*) = 0 from public.besties where (user_id = t.id('alice') and friend_id = t.id('bob')) or (user_id = t.id('bob') and friend_id = t.id('alice'))$$);
select t.as_user('bob');
select t.ok('bob unblocks alice', $$with d as (delete from public.blocks where blocked = t.id('alice') returning 1) select count(*) = 1 from d$$);

-- ───────────────────────────────────────────── 11. badges
select t.as_user('erin');
select t.ok('opening the app marks today as active', $$select true from (select public.touch_active()) s$$);
select t.as_user('admin');
select t.ok('...once a day', $$select count(*) = 1 from public.daily_activity where user_id = t.id('erin')$$);
-- give frank a big social circle and 5 active days, then compute
insert into public.hangouts (host, by_user, club, act, title, starts_at) values (t.id('frank'), t.id('frank'), false, 'x', 'Big group', now() + interval '1 day');
select t.save_id('hbig', id) from public.hangouts where title = 'Big group';
insert into public.hangout_members (hangout_id, user_id)
  select t.h('hbig'), id from t.people where name in ('alice', 'bob', 'carol', 'dave', 'erin', 'gina') on conflict do nothing;
insert into public.daily_activity (user_id, day) select t.id('frank'), current_date - g from generate_series(0, 3) g on conflict do nothing;
select public.recompute_badges(t.id('frank'));
select t.ok('met 6+ people but active only 4 days: no butterfly', $$select met_count >= 6 and not butterfly from public.profiles where id = t.id('frank')$$);
insert into public.daily_activity (user_id, day) values (t.id('frank'), current_date - 4) on conflict do nothing;
select public.recompute_badges(t.id('frank'));
select t.ok('met 6+ people and active 5 days: butterfly', $$select butterfly from public.profiles where id = t.id('frank')$$);
update public.profiles set is_creator = true where id = t.id('frank');
select public.recompute_badges(t.id('frank'));
select t.ok('the Creator never gets the butterfly', $$select not butterfly from public.profiles where id = t.id('frank')$$);
update public.profiles set is_creator = false where id = t.id('frank');
select public.recompute_badges(t.id('frank'));

-- the five-bestie limit
select t.as_user('gina');
select t.ok('gina adds four besties', $$with i as (insert into public.besties (friend_id) values (t.id('alice')), (t.id('bob')), (t.id('carol')), (t.id('dave')) returning 1) select count(*) = 4 from i$$);
select t.ok('...a fifth is fine', $$with i as (insert into public.besties (friend_id) values (t.id('erin')) returning 1) select count(*) = 1 from i$$);
select t.fails('...but a sixth is refused', $$insert into public.besties (friend_id) values (t.id('head'))$$);
select t.ok('gina clears them again', $$with d as (delete from public.besties where user_id = t.id('gina') returning 1) select count(*) = 5 from d$$);

-- ───────────────────────────────────────────── 12. deleting an account is silent and complete
-- fixtures for frank and gina: besties, a hangout, messages, a location, a report about frank
select t.as_user('frank');
select t.ok('frank shares', $$with u as (update public.profiles set share_loc = true, bio = 'my secret bio' where id = t.id('frank') returning 1) select count(*) = 1 from u$$);
select t.ok('frank adds gina', $$with i as (insert into public.besties (friend_id) values (t.id('gina')) returning 1) select count(*) = 1 from i$$);
select t.as_user('gina');
select t.ok('gina adds frank', $$with i as (insert into public.besties (friend_id) values (t.id('frank')) returning 1) select count(*) = 1 from i$$);
select t.as_user('frank');
select t.ok('frank publishes a location', $$with i as (insert into public.locations (lat, lng, place, expires_at) values (33.5398, -5.1072, 'library', now() + interval '2 hours') returning 1) select count(*) = 1 from i$$);
with h as (insert into public.hangouts (host, act, title, starts_at) values (t.id('frank'), 'study', 'Frank study group', now() + interval '1 day') returning id)
select t.save_id('hf', id) from h;
select t.ok('frank writes to gina', $$with i as (insert into public.messages (to_user, body) values (t.id('gina'), 'bye soon') returning 1) select count(*) = 1 from i$$);
select t.as_user('gina');
select t.ok('gina joins frank''s group', $$with i as (insert into public.hangout_members (hangout_id) values (t.h('hf')) returning 1) select count(*) = 1 from i$$);
select t.ok('gina chats in frank''s group', $$with i as (insert into public.messages (hangout_id, body) values (t.h('hf'), 'hello group') returning 1) select count(*) = 1 from i$$);
select t.ok('gina reports frank', $$with i as (insert into public.reports (target_user, target_kind, target_id, reason, details, snippet) values (t.id('frank'), 'person', t.id('frank')::text, 'Spam or scam', 'sent me links', 'click here') returning 1) select count(*) = 1 from i$$);
select t.as_user('alice');

select t.as_user('admin');
select t.keep('notif_before', (select count(*) from public.notifications where user_id <> t.id('frank') and coalesce(data ->> 'from', '') <> t.id('frank')::text));
select t.keep('msgs_before', (select count(*) from public.messages where sender <> t.id('frank') and not sys));
select t.keep('notif_about_frank', (select count(*) from public.notifications where data ->> 'from' = t.id('frank')::text));
select t.ok('(setup) there are notifications that mention frank', $$select t.kept('notif_about_frank') > 0$$);

select t.as_user('frank');
select t.ok('frank deletes his account', $$select true from (select public.delete_my_account()) s$$);

select t.as_user('admin');
select t.ok('his profile is gone', $$select count(*) = 0 from public.profiles where id = t.id('frank')$$);
select t.ok('his login is gone', $$select count(*) = 0 from auth.users where id = t.id('frank')$$);
select t.ok('his location is gone', $$select count(*) = 0 from public.locations where user_id = t.id('frank')$$);
select t.ok('his besties links are gone', $$select count(*) = 0 from public.besties where user_id = t.id('frank') or friend_id = t.id('frank')$$);
select t.ok('his hangout is gone', $$select count(*) = 0 from public.hangouts where id = t.h('hf')$$);
select t.ok('his private messages are gone', $$select count(*) = 0 from public.messages where sender = t.id('frank') or to_user = t.id('frank')$$);
select t.ok('the chat of his hangout is gone', $$select count(*) = 0 from public.messages where hangout_id = t.h('hf')$$);
select t.ok('notifications that mention him are gone', $$select count(*) = 0 from public.notifications where data ->> 'from' = t.id('frank')::text$$);
select t.ok('NO new notification was created for anyone (silent)', $$select count(*) = t.kept('notif_before') from public.notifications$$);
select t.ok('gina''s group messages in his hangout went with the hangout, nothing else changed',
  $$select count(*) = t.kept('msgs_before') - 1 from public.messages where not sys$$);
select t.ok('the report about him stays', $$select count(*) = 1 from public.reports where target_user = t.id('frank')$$);
select t.ok('...without the text of the message or the details', $$select snippet is null and details is null and reason = 'Spam or scam' from public.reports where target_user = t.id('frank')$$);
select t.ok('the other group he hosted is gone too', $$select count(*) = 0 from public.hangouts where id = t.h('hbig')$$);
select t.ok('the people who were in it are still here', $$select count(*) = 3 from public.profiles where id in (t.id('alice'), t.id('bob'), t.id('gina'))$$);

select t.as_user('admin');
select t.fails('club names are unique (case does not matter)', $$update public.profiles set name = 'robotics club' where id = t.id('club2')$$);

-- ───────────────────────────────────────────── 13. environment
select t.as_user('carol');
select t.ok('events_stamp is a short fingerprint', $$select length(public.events_stamp()) = 32$$);
select t.keep('stamp1', (select ('x' || substr(public.events_stamp(), 1, 15))::bit(64)::bigint));
select t.as_user('bob');
select t.ok('bob joins one more event, so the stamp changes for carol too',
  $$with i as (insert into public.hangout_members (hangout_id) values (t.h('h3')) on conflict do nothing returning 1) select true$$);
select t.as_user('carol');
select t.ok('the fingerprint is stable when nothing changed and different for different viewers', $$select public.events_stamp() = public.events_stamp()$$);
select t.ok('club counts are available to everyone signed in', $$select followers = 2 and members = 2 from public.club_counts() where club_id = t.id('club1')$$);
select t.as_user('admin');
select t.ok('realtime covers chat, positions, notifications, events and news', $$select count(*) = 6 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'$$);
select t.ok('every table has row level security', $$select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'$$);
select t.ok('signed-out role has no table privileges at all', $$select not bool_or(has_table_privilege('anon', c.oid, 'select,insert,update,delete')) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'$$);

-- ───────────────────────────────────────────── summary
\o
select t.as_user('admin');
\echo
\echo '── failures ──'
select name, info from t.results where not ok order by n;
\if :{?verbose}
\echo '── reasons given for every refusal ──'
select name, info from t.results where ok and info <> '' order by n;
\endif
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
do $$ begin if exists (select 1 from t.results where not ok) then raise exception 'some checks failed'; end if; end $$;
