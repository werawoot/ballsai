-- Read-only postcheck for SQL86, same project.
-- Expected: hall_type, triggers true; anon_calls, auth_calls false; notifications equal to the
-- precheck (the file sends nothing by itself); fingerprints equal to runbook row 86.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select pg_get_constraintdef(c.oid) like '%hall_of_fame%' and pg_get_constraintdef(c.oid) like '%team_training_plan%'
          from pg_constraint c where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_notification_type_check') as hall_type,
       (select count(1) = 5 from pg_trigger where not tgisinternal and tgname in ('match_performance_notify_family', 'match_result_notify_voided',
          'hall_of_fame_notify_entry', 'athlete_badge_notify_earned', 'team_notify_status_changed')) as triggers,
       has_function_privilege('anon', 'public.notify_athlete_family(uuid,text,text,text,text,text)', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.notify_athlete_family(uuid,text,text,text,text,text)', 'execute')
         or has_function_privilege('authenticated', 'public.match_score_line(uuid)', 'execute') as auth_calls,
       (select count(id) from public.notifications) as notifications,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('notify_athlete_family', 'match_score_line', 'notify_match_performance_created',
           'notify_match_result_voided', 'notify_badge_earned', 'notify_hall_of_fame_entry', 'notify_team_status_changed')) as fingerprints;
