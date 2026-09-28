-- Read-only postcheck for SQL44. Run only against project hivedzrwrrcnjrlirhtv.
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
-- Expected: three rows for authenticated (INSERT, SELECT, DELETE), each with
-- uses_storage_object_name true and uses_venue_profile_name false.

select
  (select count(*) from storage.objects where bucket_id = 'venue-photos') as stored_objects,
  (select count(*) from public.venue_photos) as registered_photo_rows;
-- Expected: the same counts as before SQL44. It creates no objects or photo rows.
-- Then, with a real venue-owner account: upload a photo on /venue, see its preview,
-- and delete it. All three failed for owners before SQL44.
