-- Read-only postcheck for SQL73, same project.
-- Expected: table, rls, health_check true; anon_read, auth_direct_write, anon_calls
-- false; auth_calls true; and the five fingerprints equal on Staging and Production
-- (runbook row 73).

select to_regclass('public.coach_athlete_notes') is not null as table_exists,
       (select relrowsecurity from pg_class where oid = 'public.coach_athlete_notes'::regclass) as rls,
       public.coach_note_health_word('เจ็บข้อเท้า') is not null and public.coach_note_health_word('พลิกเกมได้ดี') is null as health_check,
       has_table_privilege('anon', 'public.coach_athlete_notes', 'select') as anon_read,
       has_table_privilege('authenticated', 'public.coach_athlete_notes', 'insert') or has_table_privilege('authenticated', 'public.coach_athlete_notes', 'update')
         or has_table_privilege('authenticated', 'public.coach_athlete_notes', 'delete') as auth_direct_write,
       has_function_privilege('anon', 'public.write_coach_note(uuid, uuid, uuid, text, text)', 'execute')
         or has_function_privilege('anon', 'public.delete_coach_note(uuid)', 'execute')
         or has_function_privilege('anon', 'public.my_coach_notes(integer)', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.write_coach_note(uuid, uuid, uuid, text, text)', 'execute')
         and has_function_privilege('authenticated', 'public.delete_coach_note(uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.report_coach_note(uuid)', 'execute')
         and has_function_privilege('authenticated', 'public.my_coach_notes(integer)', 'execute') as auth_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.write_coach_note(uuid, uuid, uuid, text, text)'::regprocedure) as write_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.delete_coach_note(uuid)'::regprocedure) as delete_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.report_coach_note(uuid)'::regprocedure) as report_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.my_coach_notes(integer)'::regprocedure) as mine_fp,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.coach_note_health_word(text)'::regprocedure) as words_fp;
