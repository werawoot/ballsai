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

select
  count(*) filter (where roles::text like '%anon%') as anon_policies_on_objects
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
-- Expected: 1. Any other number means an unintended anonymous rule exists.

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
