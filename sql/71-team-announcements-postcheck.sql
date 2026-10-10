-- Read-only postcheck for SQL71, same project.
-- Expected: tables, rls, reminded_col, type_list true; anon_read, auth_direct_write,
-- anon_calls, auth_create_notification false; auth_calls true; and the five
-- fingerprints equal on Staging and Production (runbook row 71).

select to_regclass('public.team_announcements') is not null
         and to_regclass('public.team_announcement_recipients') is not null as tables,
       (select bool_and(relrowsecurity) from pg_class where oid in ('public.team_announcements'::regclass, 'public.team_announcement_recipients'::regclass)) as rls,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'team_events' and column_name = 'reminded_at') as reminded_col,
       (select pg_get_constraintdef(c.oid) like '%team_event_reminder%' and pg_get_constraintdef(c.oid) like '%venue_booking%' from pg_constraint c where c.conname = 'notifications_notification_type_check') as type_list,
       has_table_privilege('anon', 'public.team_announcements', 'select') or has_table_privilege('anon', 'public.team_announcement_recipients', 'select') as anon_read,
       has_table_privilege('authenticated', 'public.team_announcements', 'insert') or has_table_privilege('authenticated', 'public.team_announcement_recipients', 'insert')
         or has_table_privilege('authenticated', 'public.team_announcement_recipients', 'update') as auth_direct_write,
       has_function_privilege('anon', 'public.post_team_announcement(uuid, uuid, text, boolean, boolean)', 'execute')
         or has_function_privilege('anon', 'public.my_team_announcements(integer)', 'execute')
         or has_function_privilege('anon', 'public.remind_team_event(uuid)', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.create_notification(uuid, text, text, text, text, text)', 'execute') as auth_create_notification,
       has_function_privilege('authenticated', 'public.post_team_announcement(uuid, uuid, text, boolean, boolean)', 'execute')
         and has_function_privilege('authenticated', 'public.delete_team_announcement(uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.mark_team_announcements_read(uuid[])', 'execute')
         and has_function_privilege('authenticated', 'public.my_team_announcements(integer)', 'execute')
         and has_function_privilege('authenticated', 'public.remind_team_event(uuid)', 'execute') as auth_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.post_team_announcement(uuid, uuid, text, boolean, boolean)'::regprocedure) as post_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.delete_team_announcement(uuid)'::regprocedure) as delete_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.mark_team_announcements_read(uuid[])'::regprocedure) as read_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.my_team_announcements(integer)'::regprocedure) as mine_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.remind_team_event(uuid)'::regprocedure) as remind_fp;
