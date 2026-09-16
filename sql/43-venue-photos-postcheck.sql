-- Read-only postcheck for SQL43. Run only against project hivedzrwrrcnjrlirhtv.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'venue-photos';
-- Expected: exactly one row; public = false; 5 MB; jpeg/png/webp only.

select c.relrowsecurity as rls_enabled,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'venue_photos'
     and column_name in ('object_path', 'caption', 'sort_order', 'is_cover', 'moderation_status', 'hidden_at', 'hidden_by', 'uploaded_by')) as expected_columns
from pg_class c
where c.oid = 'public.venue_photos'::regclass;
-- Expected: rls_enabled = true; expected_columns = 8.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.venue_photos'::regclass
  and pg_get_constraintdef(oid) like '%moderation_status%';
-- Expected: includes pending, visible and hidden.

select policyname, cmd, roles
from pg_policies
where (schemaname = 'public' and tablename = 'venue_photos')
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'venue_photos_%')
order by schemaname, tablename, policyname;
-- Expected: one table SELECT policy plus three storage policies (insert/select/delete).

select
  has_table_privilege('authenticated', 'public.venue_photos', 'select') as authenticated_can_select,
  has_table_privilege('authenticated', 'public.venue_photos', 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.venue_photos', 'update') as authenticated_can_update,
  has_table_privilege('authenticated', 'public.venue_photos', 'delete') as authenticated_can_delete,
  has_table_privilege('anon', 'public.venue_photos', 'select') as anon_can_select,
  has_table_privilege('anon', 'public.venue_photos', 'insert') as anon_can_insert;
-- Expected: select true/true, every mutation false. RLS still determines which rows appear.

select p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
where p.oid in (
  to_regprocedure('public.add_venue_photo_safely(uuid,text,text)'),
  to_regprocedure('public.set_venue_photo_cover_safely(uuid)'),
  to_regprocedure('public.reorder_venue_photos_safely(uuid[])'),
  to_regprocedure('public.remove_venue_photo_safely(uuid)'),
  to_regprocedure('public.moderate_venue_photo_safely(uuid,text)')
)
order by signature;
-- Expected: five rows; security_definer true; proconfig contains search_path="";
-- anon/service_role false and authenticated true for every row.
