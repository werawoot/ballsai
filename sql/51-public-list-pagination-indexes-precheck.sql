-- Read-only precheck for SQL51. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select relname, n_live_tup
from pg_stat_user_tables
where schemaname = 'public' and relname in ('venue_profiles', 'tournaments')
order by 1;
-- Expected: a few hundred rows at most, so the index build is instant. Tens of thousands
-- or more: STOP and build with CREATE INDEX CONCURRENTLY instead.

select c.relname as table_name, i.relname as index_name, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class c on c.oid = x.indrelid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('venue_profiles', 'tournaments')
order by 1, 2;
-- Expected: neither venue_profiles_published_page_idx nor tournaments_start_date_page_idx
-- yet. If an index with another name already has the same columns and order, STOP and
-- reconcile instead of adding a duplicate.
