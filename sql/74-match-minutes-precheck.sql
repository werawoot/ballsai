-- Read-only precheck for SQL74. Read the Project ID in Settings > General first.
-- Expected before SQL74 (Staging and Production): prerequisites true, minutes_table false,
-- save_fn false.

select to_regclass('public.match_results') is not null
         and to_regclass('public.team_members') is not null
         and to_regclass('public.athlete_profiles') is not null
         and to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null as prerequisites,
       to_regclass('public.team_match_minutes') is not null as minutes_table,
       to_regprocedure('public.save_match_minutes(uuid, uuid, integer, jsonb)') is not null as save_fn;
