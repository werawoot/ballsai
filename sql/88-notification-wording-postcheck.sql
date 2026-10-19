-- Read-only postcheck for SQL88, same project.
-- Expected: one_helper true; anon_calls, auth_calls false; notifications equal to the precheck;
-- fingerprints equal to runbook row 88.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text,text,text)') is not null
         and to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text)') is null as one_helper,
       has_function_privilege('anon', 'public.notify_athlete_family(uuid,text,text,text,text,text,text,text)', 'execute')
         or has_function_privilege('anon', 'public.match_score_line(uuid)', 'execute')
         or has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.notify_athlete_family(uuid,text,text,text,text,text,text,text)', 'execute')
         or has_function_privilege('authenticated', 'public.match_score_line(uuid)', 'execute')
         or has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
         or has_function_privilege('authenticated', 'public.notify_athlete_and_guardians(uuid,text,text,text,text)', 'execute') as auth_calls,
       (select count(id) from public.notifications) as notifications,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname, p.oid)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('notify_athlete_family', 'notify_athlete_and_guardians', 'notify_match_performance_created',
           'notify_match_result_voided', 'notify_badge_earned', 'notify_hall_of_fame_entry', 'notify_match_result_created')) as fingerprints;
