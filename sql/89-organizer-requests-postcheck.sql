-- Read-only postcheck for SQL89, same project.
-- Expected: tables, guard, rls true; anon_requests false; auth_requests true; anon_organizers
-- true; insert_grant false; status_check lists draft, open and closed; fingerprint equal on
-- Staging and Production to runbook row 89.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.organizer_requests') is not null
       and to_regclass('public.organizer_revocations') is not null as tables,
       exists (select 1 from pg_trigger where tgrelid = 'public.tournaments'::regclass
               and tgname = 'tournaments_guard_organizer' and tgenabled = 'O') as guard,
       (select relrowsecurity from pg_class where oid = 'public.organizer_requests'::regclass)
       and (select relrowsecurity from pg_class where oid = 'public.organizer_revocations'::regclass) as rls,
       has_function_privilege('anon', 'public.request_organizer_access(text,text,text,text,text)', 'execute') as anon_requests,
       has_function_privilege('authenticated', 'public.request_organizer_access(text,text,text,text,text)', 'execute') as auth_requests,
       has_function_privilege('anon', 'public.public_tournament_organizers(uuid[])', 'execute') as anon_organizers,
       has_table_privilege('authenticated', 'public.organizer_requests', 'insert') as insert_grant,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid = 'public.tournaments'::regclass and conname = 'tournaments_status_check') as status_check,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('request_organizer_access', 'decide_organizer_request',
               'revoke_organizer_access', 'public_tournament_organizers', 'tournaments_guard_organizer')) as fingerprints;
