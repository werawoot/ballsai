-- Read-only postcheck for SQL90. Check the project ref in the URL first.

select i.relname as index_name, x.indisvalid as valid, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = i.relnamespace
where n.nspname = 'public'
  and i.relname in ('tournaments_name_trgm_idx', 'tournaments_location_trgm_idx')
order by 1;
-- Expected: two rows, both valid = true, both USING gin with gin_trgm_ops.

select extensions.show_trgm('โคราช') as thai_trigrams;
-- Expected: a non-empty array. Empty {} means the database locale gives Thai no
-- trigrams; the index then cannot serve a Thai search (see the precheck).

explain select id from public.tournaments
where name ilike '%คัพ%' or location ilike '%คัพ%';
-- On a table of a few rows Postgres may still choose Seq Scan; that is correct for tiny
-- tables. A BitmapOr over the two indexes shows up once the table holds a few thousand
-- rows (sandbox, 200,000 rows: 2.6 ms with the indexes, about 30 ms without). Then open /tournaments?q=คัพ signed out: it must load.
