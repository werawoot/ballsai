-- Read-only precheck for SQL55. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select to_regclass('public.tournament_fixtures') is null as name_free,
       to_regprocedure('public.is_admin()') is not null as has_is_admin,
       to_regclass('public.match_results') is not null as has_match_results;
-- Expected: true, true, true.

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'tournaments' and column_name in ('id', 'organizer_id'))
    or (table_name = 'teams' and column_name in ('id', 'tournament_id', 'status'))
    or (table_name = 'match_results' and column_name = 'id'))
order by 1, 2;
-- Expected: 6 rows; every id and organizer_id / tournament_id is uuid, teams.status text.

select status, count(*) from public.teams group by status order by 1;
-- Expected: the statuses the app uses (pending, confirmed, rejected). SQL55 accepts only
-- 'confirmed' teams in a draw; any other spelling of confirmed means STOP and reconcile.
