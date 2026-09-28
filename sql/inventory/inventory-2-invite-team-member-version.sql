-- READ-ONLY. Run in the Supabase SQL Editor of ONE project; check the project ref in the URL first.
-- Production: hivedzrwrrcnjrlirhtv   Staging: vorpnkedpscsqhnrssrl

-- Second query (run separately): which version of invite_team_member is live.
-- sql/20-tournament-roster-flow-v1.sql and [beta] sql/24-team-roster-integrity-v1.sql both
-- replace it with different rules; this reads only the function's source text markers.
select pg_get_function_identity_arguments(p.oid) as args,
       position('ROSTER_LOCKED' in p.prosrc) > 0 as has_sql20_roster_lock,
       position('ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER' in p.prosrc) > 0 as has_sql20_one_roster_rule,
       position('v_last_request' in p.prosrc) > 0 as has_sql24_request_throttle
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'invite_team_member';
