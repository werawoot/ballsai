-- Read-only precheck for SQL45. Run only against project hivedzrwrrcnjrlirhtv.
-- A passing result authorises nothing. SQL45 needs separate explicit owner approval.
select
  exists (
    select 1 from storage.buckets
    where id = 'venue-photos' and public = false
  ) as bucket_exists_and_is_private,
  to_regclass('public.venue_photos') is not null as has_sql43_photo_table,
  to_regprocedure('storage.allow_any_operation(text[])') is not null as has_allow_any_operation_helper,
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'venue_photos_owner_or_admin_read'
  ) as has_sql43_owner_read_policy,
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'venue_photos_public_object_read'
  ) as already_applied;
-- Expected before SQL45: the first four true, already_applied false.
-- has_allow_any_operation_helper false means STOP: the anti-listing condition cannot be
-- expressed and the policy must be re-reviewed rather than relaxed. Do not substitute
-- storage.operation(); it is not a documented Supabase helper.
-- already_applied true means STOP and reconcile state; do not apply twice.

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'venue_photos%'
order by policyname;
-- Expected before SQL45: exactly the three SQL43 policies (owner insert, owner/admin
-- read, owner/admin delete), each for authenticated only, none for anon.

select
  moderation_status,
  count(*) as photo_rows
from public.venue_photos
group by moderation_status
order by moderation_status;
-- Informational: how many photos this policy would immediately expose. Only the
-- 'visible' count becomes publicly retrievable, and only for published venues.

select
  count(*) as visible_rows_on_published_venues
from public.venue_photos p
join public.venue_profiles v on v.id = p.venue_id
where p.moderation_status = 'visible' and v.is_published;
-- Expected: the exact number of images that go public the moment SQL45 is applied.
-- Review this number with the owner before applying.
