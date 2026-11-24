-- Read-only precheck for SQL102, the project you are on.
-- Expected on both (24 Nov 2026): sql101 true, trigger_exists false, guard_fn_exists false,
-- confirm_fp cae510df, team_updaters "confirm_payment_safely | submit_tournament_team_safely" (the
-- only functions that change a team; anything else listed must be reviewed against the rules
-- first), teams and payments as counted.
-- No backslash or asterisk, so it survives copy and paste from chat.

select exists (select 1 from pg_policy where polrelid = 'public.teams'::regclass and polname = 'teams_update_organizer_admin') as sql101,
       exists (select 1 from pg_trigger where tgrelid = 'public.teams'::regclass and tgname = 'team_status_transition_guard') as trigger_exists,
       to_regprocedure('public.enforce_team_status_transition()') is not null as guard_fn_exists,
       (select left(md5(p.prosrc), 8) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'confirm_payment_safely') as confirm_fp,
       (select string_agg(p.proname, ' | ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc ~ 'update[[:space:]]+(public[.])?teams[[:space:]]') as team_updaters,
       (select count(1) from public.teams) as teams,
       (select count(1) from public.payments) as payments;
