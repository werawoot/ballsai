-- Read-only precheck for SQL90. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select e.extname, n.nspname as schema_name, e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pg_trgm';
-- Expected: no row (SQL90 installs it in schema extensions), or one row with schema_name
-- extensions. Any other schema: STOP, SQL90 names the operator class in extensions.

select relname, n_live_tup
from pg_stat_user_tables
where schemaname = 'public' and relname = 'tournaments';
-- Expected: a few hundred rows at most, so the build is instant. Tens of thousands or
-- more: STOP and build the two indexes with CREATE INDEX CONCURRENTLY instead.

select i.relname as index_name
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = i.relnamespace
where n.nspname = 'public'
  and i.relname in ('tournaments_name_trgm_idx', 'tournaments_location_trgm_idx');
-- Expected: no rows yet.

select datcollate, datctype
from pg_database
where datname = current_database();
-- Expected: a UTF-8 locale for datctype (en_US.UTF-8, C.UTF-8 or similar). With plain C
-- or POSIX, pg_trgm finds no trigrams in Thai text and the indexes would serve Latin
-- names only: STOP and report it.
