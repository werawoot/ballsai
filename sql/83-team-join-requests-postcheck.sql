-- Read-only postcheck for SQL83, same project.
-- Expected: tables, rls, functions true; anon_request, anon_decide, member_read_tables,
-- old_remove false; anon_preview true; members_text 0; teams and members equal to the
-- precheck; fingerprints equal on Staging and Production to runbook row 83.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.team_join_requests') is not null and to_regclass('public.team_join_links') is not null as tables,
       (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.team_join_requests'::regclass, 'public.team_join_links'::regclass)) as rls,
       to_regprocedure('public.request_to_join_team(text)') is not null
         and to_regprocedure('public.decide_join_request(uuid,boolean)') is not null
         and to_regprocedure('public.leave_team(uuid)') is not null
         and to_regprocedure('public.my_children_team_memberships()') is not null
         and to_regprocedure('public.remove_team_member(uuid,text,text)') is not null
         and to_regprocedure('public.team_join_requests_for(uuid)') is not null
         and to_regprocedure('public.my_team_join_link(uuid)') is not null
         and to_regprocedure('public.update_team_join_link(uuid,boolean,boolean)') is not null as functions,
       has_function_privilege('anon', 'public.team_join_preview(text)', 'execute') as anon_preview,
       has_function_privilege('anon', 'public.request_to_join_team(text)', 'execute') as anon_request,
       has_function_privilege('anon', 'public.decide_join_request(uuid,boolean)', 'execute') as anon_decide,
       has_table_privilege('authenticated', 'public.team_join_requests', 'select')
         or has_table_privilege('authenticated', 'public.team_join_links', 'select') as member_read_tables,
       has_function_privilege('authenticated', 'public.manage_coach_beta(text,uuid,jsonb)', 'execute') as old_remove,
       (select count(id) from public.teams where members is distinct from '') as members_text,
       (select count(id) from public.teams) as teams,
       (select count(id) from public.team_members) as members,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('request_to_join_team', 'decide_join_request', 'leave_team',
           'remove_team_member', 'team_join_requests_for', 'team_join_preview', 'my_team_join_link', 'update_team_join_link',
           'notify_athlete_and_guardians', 'expire_team_join_requests', 'my_children_team_memberships')) as fingerprints;
