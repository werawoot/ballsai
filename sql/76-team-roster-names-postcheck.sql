-- Read-only postcheck for SQL76, same project.
-- Expected: functions, auth_calls true; anon_calls false; fingerprints equal on Staging
-- and Production to the values in runbook row 76.

select to_regprocedure('public.team_roster_names(uuid[])') is not null and to_regprocedure('public.set_my_display_name(text)') is not null as functions,
       has_function_privilege('authenticated', 'public.team_roster_names(uuid[])', 'execute')
         and has_function_privilege('authenticated', 'public.set_my_display_name(text)', 'execute') as auth_calls,
       has_function_privilege('anon', 'public.team_roster_names(uuid[])', 'execute')
         or has_function_privilege('anon', 'public.set_my_display_name(text)', 'execute') as anon_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.team_roster_names(uuid[])'::regprocedure) as names_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.set_my_display_name(text)'::regprocedure) as name_fp;
