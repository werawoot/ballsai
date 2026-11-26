-- Read-only postcheck for SQL106, the project you are on.
-- Expected on both: anon_reads_weight false, users_read_weight false, users_update_weight true,
-- other columns still readable true, weight_fn_definer true, callable_signed_out false,
-- callable_by_users true, weight_fn_fp the same on Staging and Production, rows_with_weight as before.
-- No backslash or asterisk, so it survives copy and paste from chat.
select has_column_privilege('anon', 'public.athlete_profiles', 'weight_kg', 'SELECT') as anon_reads_weight,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'weight_kg', 'SELECT') as users_read_weight,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'weight_kg', 'UPDATE') as users_update_weight,
       has_column_privilege('anon', 'public.athlete_profiles', 'height_cm', 'SELECT') and has_column_privilege('anon', 'public.athlete_profiles', 'display_name', 'SELECT') as other_columns_readable,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.athlete_weight_kg(uuid)')) as weight_fn_definer,
       has_function_privilege('anon', 'public.athlete_weight_kg(uuid)', 'EXECUTE') as callable_signed_out,
       has_function_privilege('authenticated', 'public.athlete_weight_kg(uuid)', 'EXECUTE') as callable_by_users,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.athlete_weight_kg(uuid)')) as weight_fn_fp,
       (select count(1) from public.athlete_profiles where weight_kg is not null) as rows_with_weight;
