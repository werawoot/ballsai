-- Read-only postcheck for SQL98, Staging (vorpnkedpscsqhnrssrl) only.
-- Expected: bodies assert_match_performance_roster_member:ba43ed37 assert_payment_team_is_pending:112c4dd5
-- create_tournament_team_safely:0fe734ab submit_tournament_team_safely:6cf8a5cd (Production's,
-- 16 Nov 2026); definer 4; acls all four
-- postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres (Production's);
-- anon_execute false; triggers match_performance_roster_guard:O payment_team_pending_guard:O.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select string_agg(p.proname || ':' || left(md5(p.prosrc), 8), ' ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
         and p.proname in ('create_tournament_team_safely', 'submit_tournament_team_safely', 'assert_match_performance_roster_member', 'assert_payment_team_is_pending')) as bodies,
       (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
         and p.proname in ('create_tournament_team_safely', 'submit_tournament_team_safely', 'assert_match_performance_roster_member', 'assert_payment_team_is_pending')) as definer,
       (select string_agg(distinct array_to_string(p.proacl, ','), ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
         and p.proname in ('create_tournament_team_safely', 'submit_tournament_team_safely', 'assert_match_performance_roster_member', 'assert_payment_team_is_pending')) as acls,
       has_function_privilege('anon', 'public.create_tournament_team_safely(uuid,text)', 'execute')
         or has_function_privilege('anon', 'public.submit_tournament_team_safely(uuid)', 'execute') as anon_execute,
       (select string_agg(tgname || ':' || tgenabled::text, ' ' order by tgname) from pg_trigger
         where not tgisinternal and tgname in ('match_performance_roster_guard', 'payment_team_pending_guard')) as triggers;
