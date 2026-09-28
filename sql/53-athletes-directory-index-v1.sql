-- 53-athletes-directory-index-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on athlete-profile-v2.
--
-- Why (T45): /athletes now reads one page of 24 public profiles at a time
-- (lib/public-athletes.ts):
--   athlete_profiles where is_public and sport = ? order by created_at desc, user_id
-- The existing athlete_profiles_discovery_idx is (sport, province, position) and has no
-- order, so without this index Postgres sorts every public athlete of the sport for every
-- page. Province, position, age and name filters narrow the same ordered scan; the name
-- search can also use athlete_profiles_display_name_trgm_idx from SQL34.
--
-- Lock: a plain CREATE INDEX blocks writes to athlete_profiles while it builds. The table
-- holds a handful of rows before closed beta; the precheck shows the count. With tens of
-- thousands of rows, build it with CREATE INDEX CONCURRENTLY outside a transaction.

begin;

create index if not exists athlete_profiles_directory_page_idx
  on public.athlete_profiles (sport, created_at desc, user_id)
  where is_public;

do $$
begin
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'athlete_profiles_directory_page_idx' and i.indisvalid
  ) then
    raise exception 'SQL53 index athlete_profiles_directory_page_idx missing or invalid';
  end if;
end;
$$;

commit;
