-- Read-only postcheck for SQL53. Check the project ref in the URL first.

select i.relname as index_name, x.indisvalid as valid, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = i.relnamespace
where n.nspname = 'public' and i.relname = 'athlete_profiles_directory_page_idx';
-- Expected: one row, valid = true.

explain select user_id from public.athlete_profiles
where is_public and sport = 'football'
order by created_at desc, user_id limit 25 offset 24;
-- On a handful of rows Postgres may still choose Seq Scan + Sort; that is correct for a
-- tiny table. Then open /athletes?page=2 signed out: it must load.
