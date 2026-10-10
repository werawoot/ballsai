-- Read-only precheck for SQL75. Read the Project ID in Settings > General first.
-- Expected before SQL75 (Staging and Production): prerequisites true, staff_table false,
-- and the five fingerprints equal to the values SQL70, SQL71, SQL72 and SQL74 left
-- (runbook rows 70-74): event_save 9ac06ac3, attendance 8862168b, post 3176a5d8,
-- plan_save 19c47546, minutes_save 72d5a3da. A different value means a function changed
-- since; stop and ask before running SQL75, which replaces them.

select to_regprocedure('public.is_team_creator(uuid)') is not null
         and to_regprocedure('public.can_view_team_events(uuid)') is not null
         and to_regprocedure('public.post_team_announcement(uuid, uuid, text, boolean, boolean)') is not null
         and to_regprocedure('public.save_team_training_plan(uuid, date, jsonb, boolean)') is not null
         and to_regclass('public.coach_athlete_notes') is not null
         and to_regprocedure('public.save_match_minutes(uuid, uuid, integer, jsonb)') is not null
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'athlete_profiles' and column_name = 'birth_date')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournaments' and column_name = 'start_date') as prerequisites,
       to_regclass('public.team_staff') is not null as staff_table,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)'::regprocedure) as event_save,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.set_team_attendance(uuid, uuid[])'::regprocedure) as attendance,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.post_team_announcement(uuid, uuid, text, boolean, boolean)'::regprocedure) as post,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_team_training_plan(uuid, date, jsonb, boolean)'::regprocedure) as plan_save,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.save_match_minutes(uuid, uuid, integer, jsonb)'::regprocedure) as minutes_save;
