-- Read-only postcheck for SQL45. Run only against project hivedzrwrrcnjrlirhtv.
select
  exists (
    select 1 from storage.buckets
    where id = 'venue-photos' and public = false
  ) as bucket_still_private;
-- Expected: true. SQL45 must never have turned the bucket public.

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'venue_photos%'
order by policyname;
-- Expected: the three SQL43 policies unchanged, plus exactly one new SELECT policy
-- venue_photos_public_object_read for {anon,authenticated} whose qual contains
-- bucket_id = 'venue-photos', an allow_any_operation call naming exactly
-- object.get_authenticated_info and object.get_authenticated, the folder-depth check,
-- moderation_status = 'visible' and is_published.
-- If the qual names any other Storage operation, the listing guard is not what was
-- reviewed: STOP and reconcile before announcing the apply as successful.

-- storage.objects already carries anonymous policies that belong to other features and
-- predate SQL45. They are expected and are not this migration's concern:
--   * athlete_avatars_public_read                      -- athlete-avatars is a public bucket
--   * athlete_highlights_owner_or_public_profile_read  -- media on public athlete profiles
-- Counting every anon policy on the table therefore returns more than one and says
-- nothing about SQL45. Any anon check below is scoped to the venue photo policies.
select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'venue_photos%'
  and roles::text like '%anon%'
order by policyname;
-- Expected: exactly one row -- venue_photos_public_object_read, cmd SELECT, roles
-- {anon,authenticated}. SQL43's three venue photo policies are authenticated-only and
-- must not appear here. Any extra row is an unintended anonymous venue-photo rule: STOP.

select
  count(*) as venue_photo_anon_policies,
  count(*) filter (
    where policyname = 'venue_photos_public_object_read'
      and roles::text like '%anon%'
      and roles::text like '%authenticated%'
  ) as expected_policy_present
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'venue_photos%'
  and roles::text like '%anon%';
-- Expected: venue_photo_anon_policies = 1 and expected_policy_present = 1.
-- Anything else means the anonymous venue-photo surface is not what was reviewed.

select
  count(*) as pending_or_hidden_objects_still_private
from public.venue_photos p
where p.moderation_status in ('pending', 'hidden');
-- Informational: these rows must remain unreachable to anon. Confirm with a signed-out
-- request against one of their object paths; it must fail.

select
  (select count(*) from storage.objects where bucket_id = 'venue-photos') as stored_objects,
  (select count(*) from public.venue_photos) as registered_photo_rows;
-- Expected: unchanged by SQL45. This migration creates no objects and no photo rows.
