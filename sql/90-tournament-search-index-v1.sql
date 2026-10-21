-- 90-tournament-search-index-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on nothing newer than SQL51. Read-only for
-- the app: the search on /tournaments works before and after this file; it only makes
-- the search fast at nationwide size.
--
-- Why: /tournaments searches by name or venue anywhere in the text, case-insensitively
-- (lib/public-tournaments.ts: name ilike '%words%' or location ilike '%words%'). A b-tree
-- index cannot serve a pattern with a leading wildcard, so without these Postgres reads
-- every tournament row on each search. A trigram GIN index serves ILIKE '%x%' on Thai and
-- Latin text alike.
--
-- Lock: a plain CREATE INDEX blocks writes to tournaments while it builds; the table holds
-- a few hundred rows at most today, so it takes milliseconds. At nationwide size build
-- these with CREATE INDEX CONCURRENTLY, outside a transaction.

begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists tournaments_name_trgm_idx
  on public.tournaments using gin (name extensions.gin_trgm_ops);

create index if not exists tournaments_location_trgm_idx
  on public.tournaments using gin (location extensions.gin_trgm_ops);

do $$
declare
  v_missing text;
begin
  select string_agg(want, ', ') into v_missing
  from unnest(array['tournaments_name_trgm_idx', 'tournaments_location_trgm_idx']) as want
  where not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = want and i.indisvalid
  );
  if v_missing is not null then
    raise exception 'SQL90 index missing or invalid: %', v_missing;
  end if;
end;
$$;

commit;
