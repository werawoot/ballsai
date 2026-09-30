-- 62-private-athlete-avatars-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on sql/athlete-profile-v2.sql (bucket and
-- athlete_profiles), public.is_admin(), and storage.allow_any_operation(text[]) (the same
-- Storage helper SQL45 requires). Run as postgres. Precheck:
-- sql/62-private-athlete-avatars-precheck.sql. Rollback:
-- sql/rollback/62-private-athlete-avatars-down.sql.
--
-- Why (T51): athlete-avatars was a public bucket. Anyone holding a photo's URL could load
-- it whatever the profile said, including the photo of a minor whose profile is private
-- or who has no guardian consent yet. Old photos replaced from /card also stayed readable.
--
-- Decision (owner, 30 Sep 2026): the database decides, the app shows signed URLs.
--   * The bucket becomes private. A public URL stops working.
--   * The owner (their own folder) and an admin may read every object, as before.
--   * Anyone else may get a signed URL (and only that: no listing, no direct download)
--     for exactly the photo an athlete's PUBLIC profile points at. A public profile
--     already requires a birth date and, for a minor, guardian consent (trigger in
--     sql/guardian-consent-enforcement-v1.sql). An old or replaced photo, or any photo of
--     a private profile, gets no URL. Supabase refuses to sign a path the caller's RLS
--     cannot read ("Either the object does not exist or you do not have access to it").
--   * The app (lib/athlete-avatar.ts) signs a page's photos in one request, for one hour;
--     a profile made private stops showing its photo within that hour at most.
--
-- The app works before and after this file: it already stores the object path and signs
-- it, and signing also works on a public bucket. Rows saved before the app change hold a
-- public URL; the policy accepts both forms, and the app reads the path out of either.
--
-- Cost at scale: the check is a primary-key lookup on athlete_profiles.user_id per object,
-- only for the photos on the page being signed (at most 50).

begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'athlete-avatars') then
    raise exception 'SQL62 requires the athlete-avatars bucket (sql/athlete-profile-v2.sql)';
  end if;
  if to_regprocedure('storage.allow_any_operation(text[])') is null then
    raise exception 'SQL62 requires storage.allow_any_operation(text[]); upgrade Storage or re-review the policy';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL62 requires public.is_admin()';
  end if;
end;
$$;

update storage.buckets set public = false where id = 'athlete-avatars';

drop policy if exists "athlete_avatars_public_read" on storage.objects;

-- The owner and an admin: every object in the folder, every operation (upload checks,
-- listing for PDPA deletion, removal, signing).
drop policy if exists athlete_avatars_owner_or_admin_read on storage.objects;
create policy athlete_avatars_owner_or_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'athlete-avatars'
  and (
    (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    or (select public.is_admin())
  )
);

-- Everyone else: four conditions, all required.
--   1. the object is in athlete-avatars;
--   2. the Storage operation is signing one or many URLs, so a listing or a direct
--      authenticated download matches nothing;
--   3. the name is exactly <user-id>/<file>;
--   4. that user's profile is public and points at this very object (as a path, or as
--      the public URL saved before this file).
drop policy if exists athlete_avatars_public_profile_sign on storage.objects;
create policy athlete_avatars_public_profile_sign
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'athlete-avatars'
  and storage.allow_any_operation(array['object.sign', 'object.sign_many'])
  and array_length(storage.foldername(storage.objects.name), 1) = 1
  and exists (
    select 1
    from public.athlete_profiles p
    where p.user_id = case
        when (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(storage.objects.name))[1])::uuid
      end
      and p.is_public
      and (
        p.profile_image_url = storage.objects.name
        or right(p.profile_image_url, length('/storage/v1/object/public/athlete-avatars/' || storage.objects.name))
           = '/storage/v1/object/public/athlete-avatars/' || storage.objects.name
      )
  )
);

commit;
