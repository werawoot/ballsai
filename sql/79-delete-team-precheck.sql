-- Read-only precheck for SQL79. Read the Project ID in Settings > General first.
-- Expected before SQL79 (Staging and Production): prerequisites and team_indexes true,
-- delete_fn false. If team_indexes is false, stop and tell the assistant.
-- teams, club_teams and draft_teams are for the record (what a coach could delete today).

select to_regclass('public.teams') is not null and to_regclass('public.team_members') is not null
         and to_regclass('public.guardian_links') is not null and to_regclass('public.team_staff') is not null
         and to_regclass('public.payments') is not null and to_regclass('public.match_results') is not null
         and to_regclass('public.match_player_performances') is not null and to_regclass('public.tournament_fixtures') is not null
         and to_regclass('public.coach_attestations') is not null and to_regclass('public.coach_verified_fields') is not null
         and to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_fixtures' and column_name = 'winner_team_id') as prerequisites,
       to_regclass('public.payments_one_payment_per_team_idx') is not null
         and to_regclass('public.coach_attestations_team_idx') is not null as team_indexes,
       to_regprocedure('public.delete_my_team(uuid,text)') is not null as delete_fn,
       (select count(id) from public.teams) as teams,
       (select count(id) from public.teams where kind = 'club') as club_teams,
       (select count(id) from public.teams where status = 'draft') as draft_teams;
