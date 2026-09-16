-- Read-only precheck for SQL43. Run only against project hivedzrwrrcnjrlirhtv.
-- A passing result authorises nothing. SQL43 requires separate explicit owner approval.
select
  to_regclass('public.venue_profiles') is not null as has_venue_profiles,
  to_regclass('public.profiles') is not null as has_profiles,
  to_regprocedure('public.is_admin()') is not null as has_is_admin,
  to_regprocedure('audit.write_admin_event(text,text,text,text,jsonb,jsonb)') is not null as has_admin_audit,
  to_regclass('public.venue_photos') is null as venue_photos_table_absent,
  not exists (select 1 from storage.buckets where id = 'venue-photos') as venue_photos_bucket_absent;
-- Expected: every has_* true; both *_absent true. Otherwise STOP and reconcile state.

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'venue_photos_%'
order by policyname;
-- Expected: zero rows. Existing policies mean a prior partial migration or manual setup.

select proname, oid::regprocedure::text as signature
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'add_venue_photo_safely',
    'set_venue_photo_cover_safely',
    'reorder_venue_photos_safely',
    'remove_venue_photo_safely',
    'moderate_venue_photo_safely'
  )
order by proname;
-- Expected: zero rows. Existing functions must never be overwritten by SQL43.
