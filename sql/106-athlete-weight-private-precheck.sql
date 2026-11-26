-- Read-only precheck for SQL106, the project you are on.
-- Expected on both (26 Nov 2026): table_select false (SQL58), anon_reads_weight true,
-- users_read_weight true, users_update_weight true, helpers true, weight_fn false.
-- No backslash or asterisk, so it survives copy and paste from chat.
select has_table_privilege('anon', 'public.athlete_profiles', 'SELECT') or has_table_privilege('authenticated', 'public.athlete_profiles', 'SELECT') as table_select,
       has_column_privilege('anon', 'public.athlete_profiles', 'weight_kg', 'SELECT') as anon_reads_weight,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'weight_kg', 'SELECT') as users_read_weight,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'weight_kg', 'UPDATE') as users_update_weight,
       to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null and to_regprocedure('public.is_team_staff(uuid)') is not null as helpers,
       to_regprocedure('public.athlete_weight_kg(uuid)') is not null as weight_fn,
       (select count(1) from public.athlete_profiles where weight_kg is not null) as rows_with_weight;
