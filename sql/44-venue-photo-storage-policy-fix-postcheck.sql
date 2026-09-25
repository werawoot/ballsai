-- Read-only postcheck for SQL44. Run only against project hivedzrwrrcnjrlirhtv.
select policyname, cmd, roles, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'venue_photos_owner_insert';
-- Expected: exactly one INSERT policy for authenticated; with_check contains
-- storage.foldername(storage.objects.name), never storage.foldername(v.name).

select
  (select count(*) from storage.objects where bucket_id = 'venue-photos') as stored_objects,
  (select count(*) from public.venue_photos) as registered_photo_rows;
-- Expected: SQL44 itself creates no objects or photo rows.
