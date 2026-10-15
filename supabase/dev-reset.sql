-- DEVELOPMENT ONLY. Deletes every Yalla table, function and policy AND ALL THE DATA IN THEM, so that
-- migrations/001_schema.sql can be run again from scratch. Never run this once real people use the app.
-- (It leaves Supabase's own tables, the people who signed up in Authentication, and uploaded files alone.)

drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists avatars_read    on storage.objects;
drop policy if exists avatars_write   on storage.objects;
drop policy if exists avatars_update  on storage.objects;
drop policy if exists avatars_delete  on storage.objects;
drop policy if exists gallery_read    on storage.objects;
drop policy if exists gallery_write   on storage.objects;
drop policy if exists gallery_remove  on storage.objects;

drop table if exists
  public.reports, public.notifications, public.daily_activity, public.profile_views, public.locations,
  public.club_gallery, public.suggestion_votes, public.club_suggestions, public.club_posts, public.messages,
  public.hangout_members, public.cohosts, public.hangouts, public.club_members, public.blocks, public.follows,
  public.besties, public.private_data, public.profiles
  cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- not part of an extension
  loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
end $$;
