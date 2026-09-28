-- Read-only precheck for SQL53. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select relname, n_live_tup
from pg_stat_user_tables
where schemaname = 'public' and relname = 'athlete_profiles';
-- Expected: a few hundred rows at most, so the build is instant. Tens of thousands or
-- more: STOP and build with CREATE INDEX CONCURRENTLY instead.

select i.relname as index_name, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class c on c.oid = x.indrelid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'athlete_profiles'
order by 1;
-- Expected: no athlete_profiles_directory_page_idx yet, and no other index with the same
-- columns and order. Otherwise STOP and reconcile instead of adding a duplicate.
