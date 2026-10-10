-- Read-only postcheck for SQL70, same project.
-- Expected: tables true, rls true, sql69_profile_fk true, anon_read false,
-- auth_direct_write false, anon_calls false, auth_calls true, and the four fingerprints
-- equal on Staging and Production (runbook row 70). Five fingerprints, not four.

select to_regclass('public.team_events') is not null
         and to_regclass('public.team_event_responses') is not null
         and to_regclass('public.team_event_attendance') is not null as tables,
       (select bool_and(relrowsecurity) from pg_class where oid in ('public.team_events'::regclass, 'public.team_event_responses'::regclass, 'public.team_event_attendance'::regclass)) as rls,
       exists (select 1 from pg_constraint where conname = 'coach_skill_assessments_athlete_profile_fkey') as sql69_profile_fk,
       has_table_privilege('anon', 'public.team_events', 'select') or has_table_privilege('anon', 'public.team_event_responses', 'select') as anon_read,
       has_table_privilege('authenticated', 'public.team_events', 'insert') or has_table_privilege('authenticated', 'public.team_event_responses', 'insert')
         or has_table_privilege('authenticated', 'public.team_event_attendance', 'insert') as auth_direct_write,
       has_function_privilege('anon', 'public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)', 'execute')
         or has_function_privilege('anon', 'public.respond_team_event(uuid, uuid, text)', 'execute')
         or has_function_privilege('anon', 'public.set_team_attendance(uuid, uuid[])', 'execute')
         or has_function_privilege('anon', 'public.my_upcoming_team_events(integer)', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)', 'execute')
         and has_function_privilege('authenticated', 'public.respond_team_event(uuid, uuid, text)', 'execute')
         and has_function_privilege('authenticated', 'public.set_team_attendance(uuid, uuid[])', 'execute')
         and has_function_privilege('authenticated', 'public.cancel_team_event(uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.my_upcoming_team_events(integer)', 'execute') as auth_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)'::regprocedure) as save_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.respond_team_event(uuid, uuid, text)'::regprocedure) as respond_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.set_team_attendance(uuid, uuid[])'::regprocedure) as attendance_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.cancel_team_event(uuid)'::regprocedure) as cancel_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.my_upcoming_team_events(integer)'::regprocedure) as mine_fp;
