-- READ-ONLY. Run in the Supabase SQL Editor of ONE project; check the project ref in the URL first.
-- Production: hivedzrwrrcnjrlirhtv   Staging: vorpnkedpscsqhnrssrl

-- Third query (run separately): privilege-only files, read from the permissions they set.
-- SQL42 is a security fix: until it is applied, a signed-in browser can call
-- create_notification and write notifications for any user. Expected after SQL42: every
-- column below is false except authenticated_can_select_notifications = true.
select
  (select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_notification' limit 1) as authenticated_can_create_notification,
  (select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_notification' limit 1) as anon_can_create_notification,
  has_table_privilege('authenticated', 'public.notifications', 'INSERT') as authenticated_can_insert_notifications,
  has_table_privilege('authenticated', 'public.notifications', 'DELETE') as authenticated_can_delete_notifications,
  has_table_privilege('anon', 'public.notifications', 'SELECT') as anon_can_select_notifications,
  has_table_privilege('authenticated', 'public.notifications', 'SELECT') as authenticated_can_select_notifications;
