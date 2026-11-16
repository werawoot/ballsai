-- Read-only precheck for SQL98, Staging (vorpnkedpscsqhnrssrl) only.
-- Expected on Staging (16 Nov 2026): prerequisites true, status_check true, functions_present 0
-- (bodies empty), triggers_present 0, payments 0, performances 0. If prerequisites or
-- status_check is false, or a function is listed with an md5 other than Production's
-- (create_tournament_team_safely 0fe734ab, submit_tournament_team_safely 6cf8a5cd,
-- assert_match_performance_roster_member ba43ed37, assert_payment_team_is_pending 112c4dd5),
-- STOP: the file would refuse anyway. Payments and performances already there are not checked
-- by the triggers (insert only); a count above 0 is only noted.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.teams') is not null and to_regclass('public.tournaments') is not null
         and to_regclass('public.team_members') is not null and to_regclass('public.payments') is not null
         and to_regclass('public.match_player_performances') is not null and to_regclass('public.player_ranks') is not null
         and to_regclass('public.profiles') is not null and to_regprocedure('public.is_admin()') is not null as prerequisites,
       exists (select 1 from pg_constraint where conrelid = 'public.teams'::regclass and conname = 'teams_status_check'
               and pg_get_constraintdef(oid) like '%''draft''%' and pg_get_constraintdef(oid) like '%''pending''%') as status_check,
       (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
         and p.proname in ('create_tournament_team_safely', 'submit_tournament_team_safely', 'assert_match_performance_roster_member', 'assert_payment_team_is_pending')) as functions_present,
       (select string_agg(p.proname || ':' || left(md5(p.prosrc), 8), ' ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
         and p.proname in ('create_tournament_team_safely', 'submit_tournament_team_safely', 'assert_match_performance_roster_member', 'assert_payment_team_is_pending')) as bodies,
       (select count(1) from pg_trigger where not tgisinternal and tgname in ('match_performance_roster_guard', 'payment_team_pending_guard')) as triggers_present,
       (select count(1) from public.payments) as payments,
       (select count(1) from public.match_player_performances) as performances;
