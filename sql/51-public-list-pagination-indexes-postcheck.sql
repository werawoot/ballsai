-- Read-only postcheck for SQL51. Check the project ref in the URL first.

select i.relname as index_name, x.indisvalid as valid, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = i.relnamespace
where n.nspname = 'public'
  and i.relname in ('venue_profiles_published_page_idx', 'tournaments_start_date_page_idx')
order by 1;
-- Expected: two rows, both valid = true.

explain select id from public.venue_profiles
where is_published order by created_at desc, id limit 21 offset 20;
explain select id from public.tournaments order by start_date, id limit 21 offset 20;
-- On a table of a few rows Postgres may still choose Seq Scan + Sort; that is correct for
-- tiny tables. The index shows up in the plan once a table holds a few hundred rows.
-- Then open /venues?page=2 and /tournaments?page=2 signed out: both must load.
