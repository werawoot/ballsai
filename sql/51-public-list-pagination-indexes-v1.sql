-- 51-public-list-pagination-indexes-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on nothing newer than SQL23.
--
-- Why: /venues and /tournaments read one page of 20 at a time (T07/T08), ordered with a
-- unique id tiebreak so pages never overlap:
--   venue_profiles where is_published order by created_at desc, id   (lib/public-venues.ts)
--   tournaments order by start_date, id                             (lib/public-tournaments.ts)
-- No existing index has that order (SQL23 indexes venues by owner and by province;
-- production-hardening indexes only open tournaments by start date), so Postgres sorts the
-- whole table for every page. These two indexes let it read just the rows of the page.
--
-- Lock: a plain CREATE INDEX blocks writes to the table while it builds. Both tables hold
-- at most a few hundred rows today, so the build takes milliseconds. At nationwide size a
-- new index on these tables should be built with CREATE INDEX CONCURRENTLY, outside a
-- transaction, as its own statement.

begin;

create index if not exists venue_profiles_published_page_idx
  on public.venue_profiles (created_at desc, id)
  where is_published;

create index if not exists tournaments_start_date_page_idx
  on public.tournaments (start_date, id);

do $$
declare
  v_missing text;
begin
  select string_agg(want, ', ') into v_missing
  from unnest(array['venue_profiles_published_page_idx', 'tournaments_start_date_page_idx']) as want
  where not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = want and i.indisvalid
  );
  if v_missing is not null then
    raise exception 'SQL51 index missing or invalid: %', v_missing;
  end if;
end;
$$;

commit;
