-- Read-only precheck for SQL76. Read the Project ID in Settings > General first.
-- Expected before SQL76 (Staging and Production): prerequisites true, names_fn false.

select to_regprocedure('public.is_team_staff(uuid)') is not null
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'athlete_profiles' and column_name = 'position')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name') as prerequisites,
       to_regprocedure('public.team_roster_names(uuid[])') is not null as names_fn;
