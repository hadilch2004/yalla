-- =====================================================================================================
-- Yalla backend, migration 001: tables, security rules, helper functions, storage, realtime.
--
-- Run it once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to read top to bottom. Everything a browser may do is decided HERE, by the database,
-- not by app.js, so a modified app cannot read or write more than the rules below allow.
--
-- Privacy rules built in (they mirror the app):
--   * Ghost mode is the default: nobody sees your location or which events you join until you opt in.
--   * Location is visible only to MUTUAL besties, only while it has not expired, only on and near campus.
--   * Blocked people cannot see you, message you, or see your location, in either direction.
--   * Deleting an account is silent: no notification, message or feed item is created for anyone.
--   * The browser can never create notifications, system messages, badges or the Creator flag.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------------ tables

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  kind             text not null default 'student' check (kind in ('student', 'club')),
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  major            text not null default '' check (char_length(major) <= 80),
  year             text not null default '' check (char_length(year) <= 20),
  grad_year        int  check (grad_year between 1990 and 2100),
  bio              text not null default '' check (char_length(bio) <= 300),
  color            text not null default '#ff7eb3' check (color ~ '^#[0-9a-fA-F]{6}$'),
  photo_path       text check (char_length(photo_path) <= 200),           -- file in the "avatars" bucket
  -- privacy switches (all chosen by the person)
  share_loc        boolean not null default false,                         -- false = ghost mode
  precise          boolean not null default true,                          -- false = share only the campus spot
  private_browsing boolean not null default false,                         -- do not show up in other people's "who viewed"
  show_taste       boolean not null default true,
  near_alerts      boolean not null default true,
  alerts           boolean not null default true,
  fav_spots        text[] not null default '{}' check (cardinality(fav_spots) <= 12),
  interests        text[] not null default '{}' check (cardinality(interests) <= 20),
  -- club-only text
  category         text not null default '' check (char_length(category) <= 40),
  tagline          text not null default '' check (char_length(tagline) <= 120),
  summary          text not null default '' check (char_length(summary) <= 600),
  meets            text not null default '' check (char_length(meets) <= 120),
  -- set by the server only (browsers have no permission to write these columns)
  is_creator       boolean not null default false,
  club_approved    boolean not null default false,
  butterfly        boolean not null default false,
  met_count        int not null default 0,
  agreed_at        timestamptz,
  created_at       timestamptz not null default now(),
  last_seen        timestamptz
);

-- two clubs cannot share a name (the app has always said so)
create unique index profiles_club_name_idx on public.profiles (lower(name)) where kind = 'club';

-- taste model, spot history: private to the owner
create table public.private_data (
  user_id    uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  prefs      jsonb check (octet_length(prefs::text) <= 20000),     -- the taste model
  visits     jsonb check (octet_length(visits::text) <= 60000),    -- spot history
  trail      jsonb check (octet_length(trail::text) <= 20000),     -- recent path on the map
  misc       jsonb not null default '{}'::jsonb check (octet_length(misc::text) <= 12000),   -- small app state (what you have seen...)
  updated_at timestamptz not null default now()
);

-- directed edges: a row (A -> B) means "A added B". Both rows existing = mutual besties.
create table public.besties (
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.follows (
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  club_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id),
  check (user_id <> club_id)
);

create table public.blocks (
  blocker    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

-- community membership. "head" = the starred owners of the club, who can run it from their own student account.
create table public.club_members (
  club_id    uuid not null references public.profiles (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  status     text not null default 'pending' check (status in ('pending', 'member')),
  is_head    boolean not null default false,
  role       text not null default '' check (char_length(role) <= 40),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id),
  check (club_id <> user_id)
);

create table public.hangouts (
  id          uuid primary key default gen_random_uuid(),
  host        uuid not null references public.profiles (id) on delete cascade,   -- a student, or a club
  by_user     uuid references public.profiles (id) on delete set null,           -- the person who actually posted it
  club        boolean not null default false,                                    -- set by the server from the host
  act         text not null check (char_length(act) between 1 and 20),
  title       text not null check (char_length(btrim(title)) between 1 and 100),
  place       text not null default '' check (char_length(place) <= 30),         -- campus spot key, like 'library'
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  where_text  text not null default '' check (char_length(where_text) <= 120),
  starts_at   timestamptz not null,
  max_people  int not null default 10 check (max_people between 2 and 500),
  description text not null default '' check (char_length(description) <= 500),
  created_at  timestamptz not null default now()
);
create index hangouts_starts_idx on public.hangouts (starts_at);
create index hangouts_host_idx on public.hangouts (host);

-- clubs co-hosting an event
create table public.cohosts (
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  club_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  primary key (hangout_id, club_id)
);

create table public.hangout_members (
  hangout_id uuid not null references public.hangouts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  joined_at  timestamptz not null default now(),
  primary key (hangout_id, user_id)
);
create index hangout_members_user_idx on public.hangout_members (user_id);

-- one table for the three kinds of chat: hangout group chat, club community chat, private (direct) messages
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  hangout_id uuid references public.hangouts (id) on delete cascade,
  club_id    uuid references public.profiles (id) on delete cascade,
  to_user    uuid references public.profiles (id) on delete cascade,
  sender     uuid not null references public.profiles (id) on delete cascade default auth.uid(),  -- deleting an account removes its messages
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  sticker    boolean not null default false,
  sys        boolean not null default false,                -- system lines like "Salma started this hangout": server only
  created_at timestamptz not null default now(),
  check (num_nonnulls(hangout_id, club_id, to_user) = 1)
);
create index messages_hangout_idx on public.messages (hangout_id, created_at);
create index messages_club_idx on public.messages (club_id, created_at);
create index messages_dm_idx on public.messages (to_user, sender, created_at);
create index messages_sender_idx on public.messages (sender, created_at);

create table public.club_posts (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.profiles (id) on delete cascade,
  by_user     uuid references public.profiles (id) on delete set null default auth.uid(),
  body        text not null default '' check (char_length(body) <= 1000),
  hangout_id  uuid references public.hangouts (id) on delete cascade,   -- a post that announces an event
  created_at  timestamptz not null default now()
);
create index club_posts_club_idx on public.club_posts (club_id, created_at desc);

create table public.club_suggestions (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.profiles (id) on delete cascade,
  from_user  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  status     text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

create table public.suggestion_votes (
  suggestion_id uuid not null references public.club_suggestions (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  primary key (suggestion_id, user_id)
);

create table public.club_gallery (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.profiles (id) on delete cascade,
  path       text not null check (char_length(path) <= 200),              -- file in the "gallery" bucket
  caption    text not null default '' check (char_length(caption) <= 140),
  created_at timestamptz not null default now()
);

-- the live location: ONE row per person, overwritten as they move. Expired rows are never shown.
create table public.locations (
  user_id    uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  acc        real,                                                         -- accuracy in metres
  place      text not null default '' check (char_length(place) <= 30),
  note       text not null default '' check (char_length(note) <= 80),     -- "What are you up to?"
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- who looked at whose profile. Written only by record_view().
create table public.profile_views (
  target  uuid not null references public.profiles (id) on delete cascade,
  viewer  uuid not null references public.profiles (id) on delete cascade,
  last_at timestamptz not null default now(),
  n       int not null default 1,
  primary key (target, viewer)
);

create table public.daily_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- reports for moderators. Nobody can read this table from the app, only you in the Supabase dashboard.
-- target_user has no foreign key on purpose: a report about someone who deleted their account stays (without the content).
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid references public.profiles (id) on delete set null default auth.uid(),
  target_user uuid,
  target_kind text not null check (target_kind in ('person', 'message', 'event', 'club')),
  target_id   text not null default '' check (char_length(target_id) <= 80),
  reason      text not null check (char_length(reason) between 1 and 60),
  details     text check (char_length(details) <= 500),
  snippet     text check (char_length(snippet) <= 300),
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------ helper functions
-- All "security definer": they look at tables the caller may not read directly, and return only yes/no.

create function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create function public.are_besties(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from besties where user_id = a and friend_id = b)
     and exists (select 1 from besties where user_id = b and friend_id = a)
$$;

create function public.is_student(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = u and kind = 'student')
$$;

-- private settings (ghost mode, private browsing) are hidden from everyone but their owner, so the rules read them here
create function public.is_sharing(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select share_loc from profiles where id = u), false)
$$;

create function public.is_private_browsing(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select private_browsing from profiles where id = u), false)
$$;

-- the club account itself, or one of its starred heads, may run the club
create function public.can_manage_club(club uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles c where c.id = club and c.kind = 'club')
     and (club = uid or exists (select 1 from club_members m
                                where m.club_id = club and m.user_id = uid and m.is_head and m.status = 'member'))
$$;

-- "owner" is a student (acting as themselves) or a club (acted for by the club account or one of its heads)
create function public.acts_for(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (owner = auth.uid() or public.can_manage_club(owner, auth.uid()))
$$;

create function public.is_community_member(club uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_manage_club(club, uid)
      or exists (select 1 from club_members m where m.club_id = club and m.user_id = uid and m.status = 'member')
$$;

-- followers can read the news, only accepted members can chat
create function public.in_community(club uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_community_member(club, uid)
      or exists (select 1 from follows f where f.club_id = club and f.user_id = uid)
$$;

create function public.is_hangout_member(hid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hangout_members where hangout_id = hid and user_id = uid)
$$;

create function public.can_manage_hangout(hid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hangouts h where h.id = hid
                 and (h.host = uid or public.can_manage_club(h.host, uid)
                      or exists (select 1 from cohosts c where c.hangout_id = h.id and c.status = 'accepted'
                                 and public.can_manage_club(c.club_id, uid))))
$$;

-- student events: everyone (except people who blocked each other). Club events: followers of the host club or of an
-- accepted co-host, the clubs themselves, and a club that has been invited to co-host.
-- The _row version works from the row itself, so a brand new event can be read back in the same request that created it.
create function public.can_see_hangout_row(h public.hangouts, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null
    and not public.is_blocked(uid, h.host)
    and (not h.club
         or h.host = uid
         or public.can_manage_club(h.host, uid)
         or exists (select 1 from follows f where f.user_id = uid and f.club_id = h.host)
         or exists (select 1 from cohosts c
                    where c.hangout_id = h.id
                      and (public.can_manage_club(c.club_id, uid)
                           or (c.status = 'accepted' and exists (select 1 from follows f where f.user_id = uid and f.club_id = c.club_id)))))
$$;

create function public.can_see_hangout(hid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hangouts h where h.id = hid and public.can_see_hangout_row(h, uid))
$$;

-- the number of people going, without revealing who (people in ghost mode are counted but never named)
create function public.going_count(hid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.can_see_hangout(hid, auth.uid())
              then (select count(*)::int from hangout_members where hangout_id = hid) else 0 end
$$;

-- people going to each event you can see, without naming anyone (people in ghost mode are counted, never named)
create function public.hangout_counts() returns table (hangout_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select m.hangout_id, count(*)::int
    from hangout_members m
    join hangouts h on h.id = m.hangout_id
   where auth.uid() is not null and public.can_see_hangout_row(h, auth.uid())
   group by m.hangout_id
$$;

-- a tiny fingerprint of the events you can see (who is hosting, how many are going, co-host answers). The app asks for this
-- every few seconds and only downloads the full lists when it changed, which keeps data use low.
create function public.events_stamp() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(md5(string_agg(h.id::text || ':' || coalesce(m.n, 0) || ':' || coalesce(c.s, ''), ',' order by h.id)), '')
    from hangouts h
    left join (select hangout_id, count(*) as n from hangout_members group by hangout_id) m on m.hangout_id = h.id
    left join (select hangout_id, string_agg(club_id::text || status, '' order by club_id) as s from cohosts group by hangout_id) c on c.hangout_id = h.id
   where auth.uid() is not null and h.starts_at > now() - interval '3 days' and public.can_see_hangout_row(h, auth.uid())
$$;

-- follower and accepted-member counts for every club (counts only, nobody is named)
create function public.club_counts() returns table (club_id uuid, followers int, members int)
language sql stable security definer set search_path = public as $$
  select p.id,
         (select count(*)::int from follows f where f.club_id = p.id),
         (select count(*)::int from club_members m where m.club_id = p.id and m.status = 'member')
    from profiles p
   where auth.uid() is not null and p.kind = 'club' and not public.is_blocked(auth.uid(), p.id)
$$;

create function public.follower_count(club uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 0 else (select count(*)::int from follows where club_id = club) end
$$;

-- ------------------------------------------------------------------------------------------ triggers

-- Every new sign-up gets a profile. The terms/16+ confirmation is required here too, not only in the app.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  k text := case when m ->> 'kind' = 'club' then 'club' else 'student' end;
  picks text[] := '{}';
begin
  if coalesce(m ->> 'agreed', '') <> 'true' then
    raise exception 'You must accept the terms and confirm you are 16 or older';
  end if;
  if jsonb_typeof(m -> 'interests') = 'array' then
    select coalesce(array_agg(left(x, 20)), '{}') into picks
      from (select jsonb_array_elements_text(m -> 'interests') x limit 20) q;
  end if;
  insert into profiles (id, kind, name, major, year, grad_year, category, bio, summary, meets, color, interests, agreed_at)
  values (new.id, k,
          left(coalesce(nullif(btrim(m ->> 'name'), ''), split_part(coalesce(new.email, 'student'), '@', 1)), 60),
          left(coalesce(m ->> 'major', ''), 80),
          left(coalesce(m ->> 'year', ''), 20),
          case when (m ->> 'grad_year') ~ '^(19|20)[0-9]{2}$' then (m ->> 'grad_year')::int end,
          left(coalesce(m ->> 'category', ''), 40),
          left(coalesce(m ->> 'bio', ''), 300),
          left(coalesce(m ->> 'summary', ''), 600),
          left(coalesce(m ->> 'meets', ''), 120),
          case when (m ->> 'color') ~ '^#[0-9a-fA-F]{6}$' then m ->> 'color' else '#ff7eb3' end,
          picks,
          now());
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- hangouts: the server decides who posted it and whether it is a club event
create function public.hangouts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.by_user := auth.uid();
  new.club := coalesce((select kind = 'club' from profiles where id = new.host), false);
  return new;
end $$;
create trigger hangouts_before_insert before insert on public.hangouts
  for each row execute function public.hangouts_before_insert();

-- a new hangout: the host joins it, a system line starts the chat, club events appear in the club's news
create function public.hangouts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text := (select name from profiles where id = new.host);
begin
  if new.club then
    insert into club_posts (club_id, by_user, body, hangout_id) values (new.host, new.by_user, '', new.id);
    insert into messages (hangout_id, sender, body, sys) values (new.id, new.host, nm || ' posted this event', true);
  else
    insert into hangout_members (hangout_id, user_id) values (new.id, new.host);
    insert into messages (hangout_id, sender, body, sys) values (new.id, new.host, nm || ' started this hangout', true);
  end if;
  return new;
end $$;
create trigger hangouts_after_insert after insert on public.hangouts
  for each row execute function public.hangouts_after_insert();

-- joining: students only, not full, not blocked by the host
create function public.members_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hangouts%rowtype;
begin
  select * into h from hangouts where id = new.hangout_id;
  if not found then raise exception 'No such hangout'; end if;
  if not exists (select 1 from profiles where id = new.user_id and kind = 'student') then
    raise exception 'Only students can join hangouts';
  end if;
  if public.is_blocked(new.user_id, h.host) then raise exception 'You cannot join this hangout'; end if;
  if (select count(*) from hangout_members where hangout_id = new.hangout_id) >= h.max_people then
    raise exception 'This hangout is full';
  end if;
  return new;
end $$;
create trigger members_before_insert before insert on public.hangout_members
  for each row execute function public.members_before_insert();

-- badges: Butterfly = met 6 or more people AND active on 5 of the last 14 days. Never for the Creator.
create function public.recompute_badges(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare met int; act int;
begin
  select count(distinct m2.user_id) into met
    from hangout_members m1
    join hangout_members m2 on m2.hangout_id = m1.hangout_id and m2.user_id <> uid
   where m1.user_id = uid;
  select count(*) into act from daily_activity where user_id = uid and day > current_date - 14;
  update profiles set met_count = met, butterfly = (not is_creator and met >= 6 and act >= 5)
   where id = uid and kind = 'student';
end $$;

-- after someone joins: tell their mutual besties (unless they are in ghost mode), refresh the badges
create function public.members_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hangouts%rowtype; who profiles%rowtype; r record;
begin
  select * into h from hangouts where id = new.hangout_id;
  select * into who from profiles where id = new.user_id;
  if who.share_loc then
    for r in
      select p.id from profiles p
       where p.kind = 'student' and p.alerts and p.id <> new.user_id
         and public.are_besties(p.id, new.user_id)
         and not public.is_blocked(p.id, new.user_id)
         and public.can_see_hangout(h.id, p.id)
    loop
      insert into notifications (user_id, kind, data)
      values (r.id, 'going', jsonb_build_object('from', new.user_id, 'hangout', h.id, 'title', h.title, 'host', new.user_id = h.host));
    end loop;
  end if;
  -- "Bob joined" in the group chat, but never for people in ghost mode (they join silently) and not for the host
  if who.share_loc and new.user_id <> h.host then
    insert into messages (hangout_id, sender, body, sys) values (h.id, new.user_id, who.name || ' joined', true);
  end if;
  perform public.recompute_badges(m.user_id) from hangout_members m where m.hangout_id = new.hangout_id;
  return new;
end $$;
create trigger members_after_insert after insert on public.hangout_members
  for each row execute function public.members_after_insert();

-- a student hangout with nobody left in it disappears (club events stay until their club removes them)
create function public.members_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from hangouts h
   where h.id = old.hangout_id and not h.club
     and not exists (select 1 from hangout_members where hangout_id = h.id);
  return null;
end $$;
create trigger members_after_delete after delete on public.hangout_members
  for each row execute function public.members_after_delete();

-- the app promises five besties at most
create function public.besties_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from besties where user_id = new.user_id) >= 5 then
    raise exception 'Besties are limited to 5. Remove one first.';
  end if;
  return new;
end $$;
create trigger besties_before_insert before insert on public.besties
  for each row execute function public.besties_before_insert();

-- besties: tell the other person about a new request (or that it was accepted)
create function public.besties_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from besties where user_id = new.friend_id and friend_id = new.user_id) then
    insert into notifications (user_id, kind, data)
    values (new.friend_id, 'bestie_ok', jsonb_build_object('from', new.user_id));
  else
    insert into notifications (user_id, kind, data)
    values (new.friend_id, 'bestie_req', jsonb_build_object('from', new.user_id));
  end if;
  return new;
end $$;
create trigger besties_after_insert after insert on public.besties
  for each row execute function public.besties_after_insert();

-- blocking cuts every tie in both directions
create function public.blocks_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from besties where (user_id = new.blocker and friend_id = new.blocked) or (user_id = new.blocked and friend_id = new.blocker);
  delete from follows where (user_id = new.blocker and club_id = new.blocked) or (user_id = new.blocked and club_id = new.blocker);
  delete from club_members where (club_id = new.blocked and user_id = new.blocker) or (club_id = new.blocker and user_id = new.blocked);
  return new;
end $$;
create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.blocks_after_insert();

-- club membership: accepted members follow the club automatically; a request tells the club's account
create function public.club_members_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'member' then
    insert into follows (user_id, club_id) values (new.user_id, new.club_id) on conflict do nothing;
    -- tell the person the club accepted them (not when the club adds a head or when nothing changed)
    if tg_op = 'UPDATE' and old.status = 'pending' then
      insert into notifications (user_id, kind, data) values (new.user_id, 'accepted', jsonb_build_object('from', new.club_id));
    end if;
  elsif tg_op = 'INSERT' and new.status = 'pending' then
    insert into notifications (user_id, kind, data)
    values (new.club_id, 'req', jsonb_build_object('from', new.user_id));
  end if;
  return new;
end $$;
create trigger club_members_after_write after insert or update on public.club_members
  for each row execute function public.club_members_after_write();

-- a new follower is told to the club
create function public.follows_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, data) values (new.club_id, 'follow', jsonb_build_object('from', new.user_id));
  return new;
end $$;
create trigger follows_after_insert after insert on public.follows
  for each row execute function public.follows_after_insert();

-- co-hosting: the invited club hears about the invitation, the host hears about the answer
create function public.cohosts_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hangouts%rowtype;
begin
  select * into h from hangouts where id = new.hangout_id;
  if tg_op = 'INSERT' then
    insert into notifications (user_id, kind, data)
    values (new.club_id, 'collab', jsonb_build_object('from', h.host, 'hangout', h.id, 'title', h.title));
  elsif new.status = 'accepted' and old.status = 'pending' then
    insert into notifications (user_id, kind, data)
    values (h.host, 'collabok', jsonb_build_object('from', new.club_id, 'hangout', h.id, 'title', h.title));
  end if;
  return new;
end $$;
create trigger cohosts_after_write after insert or update on public.cohosts
  for each row execute function public.cohosts_after_write();

-- an idea in the suggestion box: tell the club
create function public.suggestions_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, data) values (new.club_id, 'sug', jsonb_build_object('from', new.from_user));
  return new;
end $$;
create trigger suggestions_after_insert after insert on public.club_suggestions
  for each row execute function public.suggestions_after_insert();

-- a request can only be made as "pending"; only a head can accept it or make someone a head
create function public.club_members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = new.club_id and kind = 'club') then raise exception 'Not a club'; end if;
  if tg_op = 'INSERT' and not public.can_manage_club(new.club_id, auth.uid()) then
    new.status := 'pending'; new.is_head := false; new.role := '';
    if public.is_blocked(new.user_id, new.club_id) then raise exception 'You cannot join this club'; end if;
  end if;
  return new;
end $$;
create trigger club_members_before_write before insert on public.club_members
  for each row execute function public.club_members_before_write();

-- a chat flood guard (free plans have limits): at most 20 messages from one person in 10 seconds
create function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.sys and (select count(*) from messages where sender = new.sender and created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'Slow down a little';
  end if;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

-- live location rules, enforced by the server: ghost mode off, on or near campus, never longer than 8 hours
create function public.locations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = new.user_id and share_loc and kind = 'student') then
    raise exception 'Ghost mode is on';
  end if;
  -- campus centre; keep in step with CAMPUS_CENTER / LIVE_RADIUS_M in app.js
  if public.distance_m(new.lat, new.lng, 33.53989, -5.10674) > 3000 then
    raise exception 'Outside campus';
  end if;
  new.updated_at := now();
  if new.expires_at > now() + interval '8 hours' then new.expires_at := now() + interval '8 hours'; end if;
  return new;
end $$;
create trigger locations_guard before insert or update on public.locations
  for each row execute function public.locations_guard();

-- turning ghost mode on removes your position from the server immediately
create function public.profiles_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.share_loc then delete from locations where user_id = new.id; end if;
  return null;
end $$;
create trigger profiles_after_update after update of share_loc on public.profiles
  for each row execute function public.profiles_after_update();

-- when an account is deleted, notifications that mention it vanish too. Nothing new is created: deletion is silent.
create function public.profiles_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where data ->> 'from' = old.id::text;
  return old;
end $$;
create trigger profiles_before_delete before delete on public.profiles
  for each row execute function public.profiles_before_delete();

-- ------------------------------------------------------------------------------------------ functions the app calls

-- your own private settings (nobody else can read these columns)
create function public.my_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) from (
    select share_loc, precise, private_browsing, near_alerts, alerts, last_seen from profiles where id = auth.uid()
  ) s
$$;

-- call when the app opens: marks today as active (for the Butterfly badge) and updates "last seen"
create function public.touch_active() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update profiles set last_seen = now() where id = auth.uid();
  insert into daily_activity (user_id, day) values (auth.uid(), current_date) on conflict do nothing;
  perform public.recompute_badges(auth.uid());
end $$;

-- call when someone opens a profile. Private browsing, blocks and yourself are ignored.
create function public.record_view(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_target = auth.uid() then return; end if;
  if public.is_blocked(auth.uid(), p_target) then return; end if;
  if exists (select 1 from profiles where id = auth.uid() and private_browsing) then return; end if;
  if not exists (select 1 from profiles where id = p_target and kind = 'student') then return; end if;
  insert into profile_views (target, viewer) values (p_target, auth.uid())
  on conflict (target, viewer) do update set last_at = now(), n = profile_views.n + 1;
end $$;

-- "Delete my account". Silent by design: nothing is sent to anyone. Everything cascades from the profile.
-- Before calling it, the app removes the person's own files with the Storage API (SQL cannot delete stored files).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update reports set snippet = null, details = null where target_user = auth.uid();   -- reports about them stay, without content
  delete from auth.users where id = auth.uid();                                       -- cascades to the profile and everything else
end $$;

-- removes positions that have expired (also schedule it, see SETUP-SUPABASE.md)
create function public.cleanup_expired_locations() returns void
language sql security definer set search_path = public as $$
  delete from locations where expires_at < now();
$$;

-- ------------------------------------------------------------------------------------------ row level security

alter table public.profiles          enable row level security;
alter table public.private_data      enable row level security;
alter table public.besties           enable row level security;
alter table public.follows           enable row level security;
alter table public.blocks            enable row level security;
alter table public.club_members      enable row level security;
alter table public.hangouts          enable row level security;
alter table public.cohosts           enable row level security;
alter table public.hangout_members   enable row level security;
alter table public.messages          enable row level security;
alter table public.club_posts        enable row level security;
alter table public.club_suggestions  enable row level security;
alter table public.suggestion_votes  enable row level security;
alter table public.club_gallery      enable row level security;
alter table public.locations         enable row level security;
alter table public.profile_views     enable row level security;
alter table public.daily_activity    enable row level security;
alter table public.notifications     enable row level security;
alter table public.reports           enable row level security;

-- profiles: everyone signed in can read profiles (except people who blocked each other). You edit only your own row.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_blocked(auth.uid(), id));
-- your own profile; a club's heads may also edit the club's profile
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_manage_club(id, auth.uid()))
  with check (id = auth.uid() or public.can_manage_club(id, auth.uid()));

create policy private_data_all on public.private_data for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- besties
create policy besties_select on public.besties for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
create policy besties_insert on public.besties for insert to authenticated
  with check (user_id = auth.uid() and public.is_student(user_id) and public.is_student(friend_id)
              and not public.is_blocked(user_id, friend_id));
create policy besties_delete on public.besties for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

-- follows: you see your own; a club sees who follows it
create policy follows_select on public.follows for select to authenticated
  using (user_id = auth.uid() or public.can_manage_club(club_id, auth.uid()));
create policy follows_insert on public.follows for insert to authenticated
  with check (user_id = auth.uid() and public.is_student(user_id)
              and exists (select 1 from profiles c where c.id = club_id and c.kind = 'club')
              and not public.is_blocked(user_id, club_id));
create policy follows_delete on public.follows for delete to authenticated
  using (user_id = auth.uid());

-- blocks: private to the blocker. The blocked person never learns about it.
create policy blocks_select on public.blocks for select to authenticated using (blocker = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker = auth.uid());

-- club members: you see your own row, the club's team sees all, accepted members see accepted members, heads are public
create policy club_members_select on public.club_members for select to authenticated
  using (user_id = auth.uid()
         or public.can_manage_club(club_id, auth.uid())
         or (status = 'member' and (is_head or public.is_community_member(club_id, auth.uid()))));
create policy club_members_insert on public.club_members for insert to authenticated
  with check ((user_id = auth.uid() and public.is_student(user_id)) or public.can_manage_club(club_id, auth.uid()));
create policy club_members_update on public.club_members for update to authenticated
  using (public.can_manage_club(club_id, auth.uid())) with check (public.can_manage_club(club_id, auth.uid()));
create policy club_members_delete on public.club_members for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_club(club_id, auth.uid()));

-- hangouts
create policy hangouts_select on public.hangouts for select to authenticated
  using (public.can_see_hangout_row(hangouts, auth.uid()));
create policy hangouts_insert on public.hangouts for insert to authenticated
  with check (public.acts_for(host));
create policy hangouts_update on public.hangouts for update to authenticated
  using (public.acts_for(host)) with check (public.acts_for(host));
create policy hangouts_delete on public.hangouts for delete to authenticated
  using (public.acts_for(host));

-- co-hosting: the host invites, the invited club accepts
create policy cohosts_select on public.cohosts for select to authenticated
  using (public.can_see_hangout(hangout_id, auth.uid()) or public.acts_for(club_id));
create policy cohosts_insert on public.cohosts for insert to authenticated
  with check (status = 'pending'
              and public.can_manage_hangout(hangout_id, auth.uid())
              and exists (select 1 from profiles c where c.id = club_id and c.kind = 'club')
              and club_id <> (select host from hangouts where id = hangout_id));
create policy cohosts_update on public.cohosts for update to authenticated
  using (public.acts_for(club_id)) with check (public.acts_for(club_id));
create policy cohosts_delete on public.cohosts for delete to authenticated
  using (public.acts_for(club_id) or public.can_manage_hangout(hangout_id, auth.uid()));

-- attendees: you see yourself, fellow members, the organisers, and people who chose to share (not in ghost mode)
create policy members_select on public.hangout_members for select to authenticated
  using (user_id = auth.uid()
         or public.is_hangout_member(hangout_id, auth.uid())
         or public.can_manage_hangout(hangout_id, auth.uid())
         or (public.can_see_hangout(hangout_id, auth.uid())
             and not public.is_blocked(auth.uid(), user_id)
             and public.is_sharing(user_id)));
create policy members_insert on public.hangout_members for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_hangout(hangout_id, auth.uid()));
create policy members_delete on public.hangout_members for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_hangout(hangout_id, auth.uid()));

-- messages. Blocked people's messages are hidden. System lines can only be written by the server.
create policy messages_select on public.messages for select to authenticated
  using ((sender = auth.uid() or not public.is_blocked(auth.uid(), sender))
         and ((hangout_id is not null and (public.is_hangout_member(hangout_id, auth.uid())
                                           or public.can_manage_hangout(hangout_id, auth.uid())))
              or (club_id is not null and public.is_community_member(club_id, auth.uid()))
              or (to_user is not null and (to_user = auth.uid() or sender = auth.uid()))));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender = auth.uid() and not sys
              and ((hangout_id is not null and (public.is_hangout_member(hangout_id, auth.uid())
                                                or public.can_manage_hangout(hangout_id, auth.uid())))
                   or (club_id is not null and public.is_community_member(club_id, auth.uid()))
                   or (to_user is not null and to_user <> auth.uid() and not public.is_blocked(auth.uid(), to_user))));
create policy messages_delete on public.messages for delete to authenticated
  using (sender = auth.uid()
         or (club_id is not null and public.can_manage_club(club_id, auth.uid()))
         or (hangout_id is not null and public.can_manage_hangout(hangout_id, auth.uid())));

-- community news, ideas, gallery
create policy club_posts_select on public.club_posts for select to authenticated
  using (public.in_community(club_id, auth.uid()));
create policy club_posts_insert on public.club_posts for insert to authenticated
  with check (public.can_manage_club(club_id, auth.uid()) and by_user = auth.uid());
create policy club_posts_delete on public.club_posts for delete to authenticated
  using (public.can_manage_club(club_id, auth.uid()));

create policy club_sugs_select on public.club_suggestions for select to authenticated
  using (public.is_community_member(club_id, auth.uid()));
create policy club_sugs_insert on public.club_suggestions for insert to authenticated
  with check (from_user = auth.uid() and public.is_community_member(club_id, auth.uid()));
create policy club_sugs_update on public.club_suggestions for update to authenticated
  using (public.can_manage_club(club_id, auth.uid())) with check (public.can_manage_club(club_id, auth.uid()));
create policy club_sugs_delete on public.club_suggestions for delete to authenticated
  using (from_user = auth.uid() or public.can_manage_club(club_id, auth.uid()));

create policy votes_select on public.suggestion_votes for select to authenticated
  using (exists (select 1 from public.club_suggestions s where s.id = suggestion_id));
create policy votes_insert on public.suggestion_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.club_suggestions s where s.id = suggestion_id));
create policy votes_delete on public.suggestion_votes for delete to authenticated
  using (user_id = auth.uid());

create policy gallery_select on public.club_gallery for select to authenticated using (true);
create policy gallery_insert on public.club_gallery for insert to authenticated
  with check (public.can_manage_club(club_id, auth.uid()));
create policy gallery_update on public.club_gallery for update to authenticated
  using (public.can_manage_club(club_id, auth.uid())) with check (public.can_manage_club(club_id, auth.uid()));
create policy gallery_delete on public.club_gallery for delete to authenticated
  using (public.can_manage_club(club_id, auth.uid()));

-- live locations: yours, or a MUTUAL bestie's while it has not expired and they are not in ghost mode
create policy locations_select on public.locations for select to authenticated
  using (user_id = auth.uid()
         or (expires_at > now()
             and public.are_besties(auth.uid(), user_id)
             and not public.is_blocked(auth.uid(), user_id)
             and public.is_sharing(user_id)));
create policy locations_insert on public.locations for insert to authenticated with check (user_id = auth.uid());
create policy locations_update on public.locations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy locations_delete on public.locations for delete to authenticated using (user_id = auth.uid());

-- "who viewed your profile": you read your own list, unless you browse privately yourself
create policy views_select on public.profile_views for select to authenticated
  using (target = auth.uid() and not public.is_private_browsing(auth.uid()));

create policy activity_select on public.daily_activity for select to authenticated using (user_id = auth.uid());

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- reports: write-only from the app
create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());

-- ------------------------------------------------------------------------------------------ permissions
-- New Supabase projects need explicit grants for the Data API. Signed-out visitors (anon) get nothing.

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;

-- Everyone signed in can read the public side of a profile. The private settings (ghost mode, exact or spot-only,
-- private browsing, alert switches, last seen, the time terms were accepted) have no select grant: only my_settings() returns them,
-- and only your own.
grant select (id, kind, name, major, year, grad_year, bio, color, photo_path, show_taste, fav_spots, interests,
              category, tagline, summary, meets, is_creator, club_approved, butterfly, met_count, created_at)
  on public.profiles to authenticated;
grant update (name, major, year, grad_year, bio, color, photo_path, share_loc, precise, private_browsing, show_taste,
              near_alerts, alerts, fav_spots, interests, category, tagline, summary, meets)
  on public.profiles to authenticated;                   -- not is_creator, club_approved, butterfly, met_count, kind

grant select, insert, update, delete on public.private_data to authenticated;
grant select, insert, delete on public.besties to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, delete on public.club_members to authenticated;
grant insert (club_id, user_id, status, is_head, role) on public.club_members to authenticated;
grant update (status, is_head, role) on public.club_members to authenticated;

grant select, delete on public.hangouts to authenticated;
grant insert (host, act, title, place, lat, lng, where_text, starts_at, max_people, description) on public.hangouts to authenticated;
grant update (act, title, place, lat, lng, where_text, starts_at, max_people, description) on public.hangouts to authenticated;
grant select, delete on public.cohosts to authenticated;
grant insert (hangout_id, club_id, status) on public.cohosts to authenticated;
grant update (status) on public.cohosts to authenticated;
grant select, insert, delete on public.hangout_members to authenticated;

grant select, delete on public.messages to authenticated;
grant insert (hangout_id, club_id, to_user, body, sticker) on public.messages to authenticated;

grant select, delete on public.club_posts to authenticated;
grant insert (club_id, body, hangout_id) on public.club_posts to authenticated;
grant select, delete on public.club_suggestions to authenticated;
grant insert (club_id, body) on public.club_suggestions to authenticated;
grant update (status) on public.club_suggestions to authenticated;
grant select, insert, delete on public.suggestion_votes to authenticated;
grant select, delete on public.club_gallery to authenticated;
grant insert (club_id, path, caption) on public.club_gallery to authenticated;
grant update (caption) on public.club_gallery to authenticated;

grant select, delete on public.locations to authenticated;
grant insert (user_id, lat, lng, acc, place, note, expires_at) on public.locations to authenticated;
-- user_id is listed because the app saves its position with an upsert (insert or update), which names every column it sends.
-- Changing it to somebody else's id is still impossible: the update policy requires user_id = auth.uid().
grant update (user_id, lat, lng, acc, place, note, expires_at) on public.locations to authenticated;

grant select on public.profile_views to authenticated;
grant select on public.daily_activity to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (target_user, target_kind, target_id, reason, details, snippet) on public.reports to authenticated;

-- functions: signed-in people may call the ones the app needs, nobody else
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.distance_m(double precision, double precision, double precision, double precision),
  public.is_blocked(uuid, uuid), public.are_besties(uuid, uuid), public.is_student(uuid),
  public.can_manage_club(uuid, uuid), public.acts_for(uuid), public.is_community_member(uuid, uuid),
  public.in_community(uuid, uuid), public.is_hangout_member(uuid, uuid), public.can_manage_hangout(uuid, uuid),
  public.can_see_hangout(uuid, uuid), public.can_see_hangout_row(public.hangouts, uuid), public.going_count(uuid), public.hangout_counts(), public.club_counts(), public.events_stamp(), public.follower_count(uuid),
  public.is_sharing(uuid), public.is_private_browsing(uuid),
  public.touch_active(), public.record_view(uuid), public.my_settings(), public.delete_my_account()
  to authenticated;

-- ------------------------------------------------------------------------------------------ photo storage
-- avatars: <user id>/<file>. Anyone can look at a profile photo, only the owner can change it.
-- gallery: <club id>/<file>. Only the club's team can add pictures.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
       ('gallery', 'gallery', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_read on storage.objects for select to authenticated using (bucket_id = 'avatars');
-- your own folder, or the folder of a club you are a head of (its logo)
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and ((storage.foldername(name))[1] = auth.uid()::text
                   or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                       and public.can_manage_club(((storage.foldername(name))[1])::uuid, auth.uid()))));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                  and public.can_manage_club(((storage.foldername(name))[1])::uuid, auth.uid()))));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                  and public.can_manage_club(((storage.foldername(name))[1])::uuid, auth.uid()))));

create policy gallery_read on storage.objects for select to authenticated using (bucket_id = 'gallery');
create policy gallery_write on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery'
              and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.can_manage_club(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy gallery_remove on storage.objects for delete to authenticated
  using (bucket_id = 'gallery'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.can_manage_club(((storage.foldername(name))[1])::uuid, auth.uid()));

-- ------------------------------------------------------------------------------------------ realtime
-- Live updates for chat, positions, notifications and events. Realtime applies the same row rules as above.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.locations, public.notifications, public.hangouts, public.hangout_members, public.club_posts;
  end if;
end $$;
