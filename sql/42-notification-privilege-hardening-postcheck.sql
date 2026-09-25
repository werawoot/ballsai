-- Read-only post-check for SQL42. Run only against project hivedzrwrrcnjrlirhtv.

select
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.create_notification(uuid,text,text,text,text,text)'::regprocedure;
-- Expected: one row; security_definer=true; proconfig has an empty search_path; all
-- three EXECUTE values are false.

select
  has_table_privilege('authenticated', 'public.notifications', 'select') as authenticated_can_select,
  has_table_privilege('authenticated', 'public.notifications', 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.notifications', 'references') as authenticated_can_reference,
  has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update') as authenticated_can_update_read_at,
  has_column_privilege('authenticated', 'public.notifications', 'body', 'update') as authenticated_can_update_body,
  has_column_privilege('authenticated', 'public.notifications', 'user_id', 'update') as authenticated_can_update_user_id,
  has_table_privilege('anon', 'public.notifications', 'select') as anon_can_select,
  has_table_privilege('anon', 'public.notifications', 'insert') as anon_can_insert;
-- Expected: authenticated select/read_at=true; authenticated insert/references/body/user_id=false;
-- anon select/insert=false.
