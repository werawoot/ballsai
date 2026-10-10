-- Read-only precheck for SQL70. Read the Project ID in Settings > General first.
-- Expected before SQL70 (Staging and Production): prerequisites true, events_table false,
-- save_fn false, sql69_profile_fk false, orphan_ratings 0.

select to_regclass('public.team_members') is not null
         and to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null
         and to_regclass('public.coach_skill_assessments') is not null as prerequisites,
       to_regclass('public.team_events') is not null as events_table,
       to_regprocedure('public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)') is not null as save_fn,
       exists (select 1 from pg_constraint where conname = 'coach_skill_assessments_athlete_profile_fkey') as sql69_profile_fk,
       (select count(*) from public.coach_skill_assessments c
        where not exists (select 1 from public.athlete_profiles ap where ap.user_id = c.athlete_id)) as orphan_ratings;
