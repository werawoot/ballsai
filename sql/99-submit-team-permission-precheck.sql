-- Read-only precheck for SQL99, the project you are on.
-- Expected on both (16 Nov 2026): submit_body 6cf8a5cd (the sql/20 body), tournaments 4,
-- no_organizer 0, no_status 0. register_authenticated: Production false, Staging true (the file
-- revokes it there; note the value for the rollback). If submit_body is anything else, STOP: the
-- file would refuse anyway. no_organizer, no_status and club_teams_pending above 0 are only noted.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.submit_tournament_team_safely(uuid)')) as submit_body,
       to_regprocedure('public.is_admin()') is not null as is_admin,
       to_regprocedure('public.register_team_safely(uuid,text,text)') is not null
         and has_function_privilege('authenticated', 'public.register_team_safely(uuid,text,text)', 'execute') as register_authenticated,
       (select count(1) from public.tournaments) as tournaments,
       (select count(1) from public.tournaments where organizer_id is null) as no_organizer,
       (select count(1) from public.tournaments where status is null) as no_status,
       (select count(1) from public.teams where tournament_id is null and status <> 'draft') as club_teams_pending;
