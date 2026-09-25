-- Read-only precheck for SQL44. Run only against project hivedzrwrrcnjrlirhtv.
-- A passing result authorises nothing. SQL44 needs separate explicit owner approval.
select
  exists (
    select 1 from storage.buckets
    where id = 'venue-photos' and public = false
  ) as has_private_venue_photos_bucket,
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'venue_photos_owner_insert'
      and cmd = 'INSERT'
  ) as has_sql43_insert_policy;
-- Expected: both true. Otherwise STOP and reconcile SQL43 before applying anything.

select
  policyname,
  cmd,
  roles,
  with_check,
  with_check like '%storage.foldername(storage.objects.name)%' as uses_storage_object_name,
  with_check like '%storage.foldername(v.name)%' as uses_venue_profile_name
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'venue_photos_owner_insert';
-- Expected before SQL44: exactly one authenticated INSERT policy; uses_storage_object_name
-- false and uses_venue_profile_name true. Any other result: STOP and reconcile state.
