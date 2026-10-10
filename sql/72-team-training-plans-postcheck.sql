-- Read-only postcheck for SQL72, same project.
-- Expected: table, rls, type_list true; anon_read, auth_direct_write, anon_calls,
-- auth_create_notification false; auth_calls true; and the three fingerprints equal on
-- Staging and Production (runbook row 72).

select to_regclass('public.team_training_plans') is not null as table_exists,
       (select relrowsecurity from pg_class where oid = 'public.team_training_plans'::regclass) as rls,
       (select pg_get_constraintdef(c.oid) like '%team_training_plan%' and pg_get_constraintdef(c.oid) like '%team_event_reminder%' from pg_constraint c where c.conname = 'notifications_notification_type_check') as type_list,
       has_table_privilege('anon', 'public.team_training_plans', 'select') as anon_read,
       has_table_privilege('authenticated', 'public.team_training_plans', 'insert') or has_table_privilege('authenticated', 'public.team_training_plans', 'update') as auth_direct_write,
       has_function_privilege('anon', 'public.save_team_training_plan(uuid, date, jsonb, boolean)', 'execute')
         or has_function_privilege('anon', 'public.my_team_training_plans()', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.create_notification(uuid, text, text, text, text, text)', 'execute') as auth_create_notification,
       has_function_privilege('authenticated', 'public.save_team_training_plan(uuid, date, jsonb, boolean)', 'execute')
         and has_function_privilege('authenticated', 'public.my_team_training_plans()', 'execute') as auth_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_team_training_plan(uuid, date, jsonb, boolean)'::regprocedure) as save_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.my_team_training_plans()'::regprocedure) as mine_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.bangkok_week_start(timestamptz)'::regprocedure) as week_fp;
