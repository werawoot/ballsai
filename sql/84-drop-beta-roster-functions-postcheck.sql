-- Read-only postcheck for SQL84, same project.
-- Expected: beta_functions 0; remove_overloads 1 where SQL83 is applied (0 before it);
-- fingerprints 'remove_team_member:93bb4c3a' where SQL83 is applied, empty before it.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('request_team_membership', 'approve_team_request', 'decline_team_request',
                             'list_joinable_teams', 'list_my_team_labels')) +
       (case when to_regprocedure('public.remove_team_member(uuid,text)') is null then 0 else 1 end) as beta_functions,
       (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'remove_team_member') as remove_overloads,
       coalesce((select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'remove_team_member'), '') as fingerprints;
