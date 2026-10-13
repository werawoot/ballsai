-- Read-only precheck for SQL78. Read the Project ID in Settings > General first.
-- Expected before SQL78 (Staging and Production): prerequisites true, own_team_fn false,
-- kind_column false. tournament_required says whether teams.tournament_id is NOT NULL today
-- (either is fine; SQL78 makes it optional). teams_without_tournament must be 0.

select to_regclass('public.teams') is not null and to_regclass('public.team_members') is not null
         and to_regclass('public.tournaments') is not null and to_regclass('public.guardian_links') is not null
         and to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null
         and to_regprocedure('public.get_match_plan_safely(uuid)') is not null
         and to_regprocedure('public.save_match_plan_safely(uuid,text,text,text,jsonb)') is not null
         and to_regprocedure('public.invite_team_member(uuid,text)') is not null as prerequisites,
       to_regprocedure('public.create_my_team(uuid,text)') is not null as own_team_fn,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind') as kind_column,
       (select is_nullable = 'NO' from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'tournament_id') as tournament_required,
       (select count(id) from public.teams where tournament_id is null) as teams_without_tournament,
       (select count(id) from public.teams) as teams;
