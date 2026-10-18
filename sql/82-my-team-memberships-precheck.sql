-- Read-only precheck for SQL82, same project.
-- Expected: members, teams_kind, tournaments_location, athlete_idx true; fn_exists false.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.team_members') is not null as members,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind') as teams_kind,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournaments' and column_name = 'location') as tournaments_location,
       to_regclass('public.team_members_athlete_status_idx') is not null as athlete_idx,
       to_regprocedure('public.my_team_memberships(integer)') is not null as fn_exists;
