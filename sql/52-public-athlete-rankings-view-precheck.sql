-- Read-only precheck for SQL52. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select current_setting('server_version_num')::int >= 150000 as supports_security_invoker;
-- Expected: true. Otherwise STOP: the view would run with its owner's rights and bypass RLS.

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'player_ranks' and column_name in ('id', 'player_id', 'player_name', 'team', 'province', 'position', 'sport', 'season', 'ovr', 'pts', 'pac', 'sho', 'pas', 'dri', 'def', 'rank_change'))
    or (table_name = 'athlete_profiles' and column_name in ('user_id', 'sport', 'is_public', 'birth_date'))
    or (table_name = 'player_ratings' and column_name in ('player_rank_id', 'sport', 'season', 'goals', 'assists', 'clean_sheets', 'mvps', 'matches_played')))
order by 1, 2;
-- Expected: 28 rows (16 player_ranks, 4 athlete_profiles, 8 player_ratings). Fewer: STOP.

select c.relname, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'public_athlete_rankings';
-- Expected: no row. A row means something already uses the name: STOP and reconcile.

select tablename, policyname, roles, qual
from pg_policies
where schemaname = 'public' and tablename in ('player_ranks', 'athlete_profiles', 'player_ratings') and cmd = 'SELECT'
order by 1, 2;
-- Expected: anon may read player_ranks and player_ratings, and athlete_profiles only where
-- is_public (or own row / admin). The view relies on exactly these rules.
