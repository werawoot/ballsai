-- Read-only precheck for SQL107, the project you are on.
-- Expected on both (26 Nov 2026): profile_home_fp 3c961408 (SQL91's), profile_home_definer false,
-- weight_fn true (SQL106 applied, in the same session), users_read_weight false.
-- No backslash or asterisk, so it survives copy and paste from chat.
select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.my_profile_home(text,text)')) as profile_home_fp,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.my_profile_home(text,text)')) as profile_home_definer,
       to_regprocedure('public.athlete_weight_kg(uuid)') is not null as weight_fn,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'weight_kg', 'SELECT') as users_read_weight;
