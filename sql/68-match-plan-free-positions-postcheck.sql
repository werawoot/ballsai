-- Read-only postcheck for SQL68, same project.
-- Expected: pos_x_column true, pos_y_column true, position_check true, anon_get false,
-- anon_save false, authenticated_get true, authenticated_save true, and the two
-- fingerprints equal on Staging and Production (compare with the runbook row 68).

select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'match_plan_players' and column_name = 'pos_x') as pos_x_column,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'match_plan_players' and column_name = 'pos_y') as pos_y_column,
       exists (select 1 from pg_constraint where conname = 'match_plan_players_free_position_check') as position_check,
       has_function_privilege('anon', 'public.get_match_plan_safely(uuid)', 'execute') as anon_get,
       has_function_privilege('anon', 'public.save_match_plan_safely(uuid, text, text, text, jsonb)', 'execute') as anon_save,
       has_function_privilege('authenticated', 'public.get_match_plan_safely(uuid)', 'execute') as authenticated_get,
       has_function_privilege('authenticated', 'public.save_match_plan_safely(uuid, text, text, text, jsonb)', 'execute') as authenticated_save,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.get_match_plan_safely(uuid)'::regprocedure) as get_fingerprint,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_match_plan_safely(uuid, text, text, text, jsonb)'::regprocedure) as save_fingerprint;
