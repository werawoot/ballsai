-- Read-only postcheck for SQL61. Check the project ref in the URL first.

select to_regprocedure('public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)') is not null as function_present,
       has_function_privilege('authenticated', 'public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)', 'EXECUTE') as authenticated_can_run,
       has_function_privilege('anon', 'public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)', 'EXECUTE') as anon_can_run,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'player_ranks'
          and column_name in ('pac', 'sho', 'pas', 'dri', 'def', 'position') and is_nullable = 'NO') as not_null_skill_columns;
-- Expected: true, true, false, 0.
