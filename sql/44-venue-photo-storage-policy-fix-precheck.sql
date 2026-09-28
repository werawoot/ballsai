-- Read-only precheck for SQL44. Run only against project hivedzrwrrcnjrlirhtv.
-- A passing result authorises nothing. SQL44 needs separate explicit owner approval.
select
  exists (
    select 1 from storage.buckets
    where id = 'venue-photos' and public = false
  ) as has_private_venue_photos_bucket,
  (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('venue_photos_owner_insert', 'venue_photos_owner_or_admin_read',
                         'venue_photos_owner_or_admin_delete')
  ) as sql43_owner_policies;
-- Expected: true and 3. Otherwise STOP and reconcile SQL43 before applying anything.

-- pg_policies holds the deparsed expression: Postgres writes the column as objects.name,
-- so a correct policy contains foldername(objects.name) and the SQL43 bug shows as
-- foldername(v.name).
select
  policyname,
  cmd,
  roles,
  (coalesce(qual, '') || coalesce(with_check, '')) like '%foldername(objects.name)%' as uses_storage_object_name,
  (coalesce(qual, '') || coalesce(with_check, '')) like '%foldername(v.name)%' as uses_venue_profile_name
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in ('venue_photos_owner_insert', 'venue_photos_owner_or_admin_read',
                     'venue_photos_owner_or_admin_delete')
order by policyname;
-- Expected before SQL44: three rows (INSERT, SELECT, DELETE), each with
-- uses_storage_object_name false and uses_venue_profile_name true. Any other result:
-- STOP and reconcile state.
