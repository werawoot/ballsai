-- rollback/62-private-athlete-avatars-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes
-- sql/62-private-athlete-avatars-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- Makes athlete-avatars public again and restores the read policy from
-- sql/athlete-profile-v2.sql. This reopens T51: every photo, including a private minor's,
-- becomes readable by anyone holding its URL. The app keeps working either way (it signs
-- URLs, which a public bucket also serves), so roll back only if signing itself fails.

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'athlete_avatars_public_profile_sign') then
    raise exception 'SQL62 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop policy athlete_avatars_public_profile_sign on storage.objects;
drop policy if exists athlete_avatars_owner_or_admin_read on storage.objects;

update storage.buckets set public = true where id = 'athlete-avatars';

drop policy if exists "athlete_avatars_public_read" on storage.objects;
create policy "athlete_avatars_public_read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'athlete-avatars');

commit;
