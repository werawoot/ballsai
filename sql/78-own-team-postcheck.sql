-- Read-only postcheck for SQL78, same project.
-- Expected: functions, kind_check, tournament_optional, auth_calls true; anon_calls false;
-- entries equals the teams count from the precheck (every old team became kind 'entry');
-- fingerprints equal on Staging and Production to runbook row 78. No backslash or asterisk,
-- so it survives copy and paste from chat.

select to_regprocedure('public.create_my_team(uuid,text)') is not null
         and to_regprocedure('public.enter_tournament_from_team(uuid,uuid,uuid[])') is not null
         and to_regprocedure('public.withdraw_from_entry(uuid)') is not null
         and to_regprocedure('public.keep_as_my_team(uuid)') is not null
         and to_regprocedure('public.my_entry_rosters(integer)') is not null as functions,
       exists (select 1 from pg_constraint where conrelid = 'public.teams'::regclass and conname = 'teams_kind_check') as kind_check,
       (select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'tournament_id') as tournament_optional,
       has_function_privilege('authenticated', 'public.create_my_team(uuid,text)', 'execute')
         and has_function_privilege('authenticated', 'public.enter_tournament_from_team(uuid,uuid,uuid[])', 'execute')
         and has_function_privilege('authenticated', 'public.my_entry_rosters(integer)', 'execute') as auth_calls,
       has_function_privilege('anon', 'public.create_my_team(uuid,text)', 'execute')
         or has_function_privilege('anon', 'public.enter_tournament_from_team(uuid,uuid,uuid[])', 'execute')
         or has_function_privilege('anon', 'public.withdraw_from_entry(uuid)', 'execute')
         or has_function_privilege('anon', 'public.keep_as_my_team(uuid)', 'execute')
         or has_function_privilege('anon', 'public.my_entry_rosters(integer)', 'execute')
         or has_function_privilege('anon', 'public.get_match_plan_safely(uuid)', 'execute') as anon_calls,
       (select count(id) from public.teams where kind = 'entry') as entries,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('create_my_team', 'enter_tournament_from_team', 'withdraw_from_entry', 'keep_as_my_team', 'my_entry_rosters', 'get_match_plan_safely', 'save_match_plan_safely')) as fingerprints;
