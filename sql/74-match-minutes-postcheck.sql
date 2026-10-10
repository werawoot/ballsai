-- Read-only postcheck for SQL74, same project.
-- Expected: tables, rls true; anon_read, auth_direct_write, anon_calls false; auth_calls
-- true; and the three fingerprints equal on Staging and Production (runbook row 74).

select to_regclass('public.team_match_minutes') is not null and to_regclass('public.team_match_minute_entries') is not null as tables,
       (select bool_and(relrowsecurity) from pg_class where oid in ('public.team_match_minutes'::regclass, 'public.team_match_minute_entries'::regclass)) as rls,
       has_table_privilege('anon', 'public.team_match_minutes', 'select') or has_table_privilege('anon', 'public.team_match_minute_entries', 'select') as anon_read,
       has_table_privilege('authenticated', 'public.team_match_minutes', 'insert') or has_table_privilege('authenticated', 'public.team_match_minute_entries', 'insert')
         or has_table_privilege('authenticated', 'public.team_match_minute_entries', 'update') as auth_direct_write,
       has_function_privilege('anon', 'public.save_match_minutes(uuid, uuid, integer, jsonb)', 'execute')
         or has_function_privilege('anon', 'public.my_match_minutes()', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.save_match_minutes(uuid, uuid, integer, jsonb)', 'execute')
         and has_function_privilege('authenticated', 'public.my_match_minutes()', 'execute') as auth_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_match_minutes(uuid, uuid, integer, jsonb)'::regprocedure) as save_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.my_match_minutes()'::regprocedure) as mine_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.is_team_owner(uuid)'::regprocedure) as owner_fp;
