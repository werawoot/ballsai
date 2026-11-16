-- Read-only postcheck for SQL99, the project you are on.
-- Expected on both: submit_body 8a6bfca4, definer true, acl
-- postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres, anon_execute false,
-- register_authenticated false.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.submit_tournament_team_safely(uuid)')) as submit_body,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.submit_tournament_team_safely(uuid)')) as definer,
       (select array_to_string(proacl, ',') from pg_proc where oid = to_regprocedure('public.submit_tournament_team_safely(uuid)')) as acl,
       has_function_privilege('anon', 'public.submit_tournament_team_safely(uuid)', 'execute') as anon_execute,
       to_regprocedure('public.register_team_safely(uuid,text,text)') is not null
         and has_function_privilege('authenticated', 'public.register_team_safely(uuid,text,text)', 'execute') as register_authenticated;
