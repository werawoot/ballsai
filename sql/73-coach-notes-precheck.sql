-- Read-only precheck for SQL73. Read the Project ID in Settings > General first.
-- Expected before SQL73 (Staging and Production): prerequisites true, notes_table false,
-- write_fn false.

select to_regclass('public.team_members') is not null
         and to_regclass('public.athlete_profiles') is not null
         and to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null as prerequisites,
       to_regclass('public.coach_athlete_notes') is not null as notes_table,
       to_regprocedure('public.write_coach_note(uuid, uuid, uuid, text, text)') is not null as write_fn;
