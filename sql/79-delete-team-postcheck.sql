-- Read-only postcheck for SQL79, same project.
-- Expected: delete_fn, auth_calls, indexes true; anon_calls false; teams equals the
-- precheck (applying SQL79 deletes nothing); fingerprint equal on Staging and Production to
-- runbook row 79. No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.delete_my_team(uuid,text)') is not null as delete_fn,
       has_function_privilege('authenticated', 'public.delete_my_team(uuid,text)', 'execute') as auth_calls,
       has_function_privilege('anon', 'public.delete_my_team(uuid,text)', 'execute') as anon_calls,
       to_regclass('public.match_results_team_a_idx') is not null
         and to_regclass('public.match_results_team_b_idx') is not null
         and to_regclass('public.match_player_performances_team_idx') is not null
         and to_regclass('public.tournament_fixtures_home_idx') is not null
         and to_regclass('public.tournament_fixtures_away_idx') is not null
         and to_regclass('public.tournament_fixtures_winner_idx') is not null as indexes,
       (select count(id) from public.teams) as teams,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'delete_my_team') as fingerprints;
