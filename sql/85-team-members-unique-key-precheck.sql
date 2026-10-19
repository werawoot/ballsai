-- Read-only precheck for SQL85, same project.
-- Expected Staging (18 Oct 2026): unique_key false, partial_idx true, duplicate_pairs 0.
-- Where unique_key is already true the file changes nothing but the beta partial index.
-- duplicate_pairs must be 0, or the file stops and changes nothing.
-- No backslash or asterisk, so it survives copy and paste from chat.

select exists (select 1 from pg_constraint where conrelid = 'public.team_members'::regclass and conname = 'team_members_team_id_athlete_id_key') as unique_key,
       to_regclass('public.team_members_one_active_period_idx') is not null as partial_idx,
       (select count(1) from (select team_id, athlete_id from public.team_members group by team_id, athlete_id having count(1) > 1) d) as duplicate_pairs,
       (select count(1) from public.team_members) as members;
