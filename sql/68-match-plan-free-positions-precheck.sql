-- Read-only precheck for SQL68. Check the project ref in the URL first.
-- Expected before SQL68 (Staging and Production): sql28 true, pos_x_column false,
-- pos_y_column false, position_check false, authenticated_save true. anon_save may be
-- true on a project without SQL50; SQL68 revokes it either way. plan_rows is for the
-- record only (existing plans keep working; their rows get NULL points).

select to_regprocedure('public.save_match_plan_safely(uuid, text, text, text, jsonb)') is not null
         and to_regprocedure('public.get_match_plan_safely(uuid)') is not null as sql28,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'match_plan_players' and column_name = 'pos_x') as pos_x_column,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'match_plan_players' and column_name = 'pos_y') as pos_y_column,
       exists (select 1 from pg_constraint where conname = 'match_plan_players_free_position_check') as position_check,
       has_function_privilege('authenticated', 'public.save_match_plan_safely(uuid, text, text, text, jsonb)', 'execute') as authenticated_save,
       has_function_privilege('anon', 'public.save_match_plan_safely(uuid, text, text, text, jsonb)', 'execute') as anon_save,
       (select count(*) from public.match_plan_players) as plan_rows;
