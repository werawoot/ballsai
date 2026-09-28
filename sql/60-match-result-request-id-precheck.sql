-- Read-only precheck for SQL60. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.

select to_regprocedure('public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb)') is not null as recorder_present,
       to_regclass('public.match_result_submissions') is null
         and to_regprocedure('public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)') is null as names_free;
-- Expected: true, true.

-- Matches already recorded twice: same tournament, teams and score within ten minutes.
select a.tournament_id, a.id as first_id, b.id as repeat_id, a.created_at, b.created_at as repeat_at
from public.match_results a
join public.match_results b on b.tournament_id = a.tournament_id and b.team_a_id = a.team_a_id and b.team_b_id = a.team_b_id
  and b.team_a_score = a.team_a_score and b.team_b_score = a.team_b_score
  and b.created_at > a.created_at and b.created_at < a.created_at + interval '10 minutes'
order by a.created_at desc
limit 50;
-- Expected: no rows. Any row is a likely duplicate: report it, do not delete it here
-- (voiding a result is /dashboard/results, which also takes back its rating and XP).
