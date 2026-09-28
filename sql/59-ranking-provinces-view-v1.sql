-- 59-ranking-provinces-view-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on supabase-rls (player_ranks and its public
-- read policy). Creates no function, so its place relative to SQL50 does not matter.
--
-- Why (T10): the /ranking province filter read every player_ranks row of the season to
-- list provinces. PostgREST answers at most 1000 rows, so past 1000 ranked athletes some
-- provinces silently disappeared from the filter, and every render moved the whole table.
--
-- What: public_ranking_provinces, one row per (sport, season, province) with the number
-- (the stored spelling, so choosing it matches the same rows the filter reads)
-- of ranked athletes. security_invoker, so player_ranks' own RLS applies exactly as for the
-- read it replaces; it adds no column a caller could not already read. The index lets
-- Postgres answer from the index alone for one sport and season.
--
-- Lock: a plain CREATE INDEX blocks writes to player_ranks while it builds; see SQL53's
-- note for large tables.

begin;

create index if not exists player_ranks_sport_season_province_idx
  on public.player_ranks (sport, season, province);

create or replace view public.public_ranking_provinces with (security_invoker = true) as
select r.sport, r.season, r.province, count(*)::integer as athletes
from public.player_ranks r
where r.province is not null and btrim(r.province) <> ''
group by r.sport, r.season, r.province;

revoke all on public.public_ranking_provinces from public, anon, authenticated;
grant select on public.public_ranking_provinces to anon, authenticated, service_role;

comment on view public.public_ranking_provinces is
  'One row per sport, season and province with ranked athletes, for the /ranking filter. Caller RLS applies (security_invoker). sql/59.';

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'public_ranking_provinces' and c.relkind = 'v'
      and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
  ) then
    raise exception 'SQL59 view missing or not security_invoker';
  end if;
  if not has_table_privilege('anon', 'public.public_ranking_provinces', 'SELECT')
     or has_table_privilege('anon', 'public.public_ranking_provinces', 'INSERT')
     or has_table_privilege('authenticated', 'public.public_ranking_provinces', 'UPDATE') then
    raise exception 'SQL59 view privileges are not SELECT-only';
  end if;
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'player_ranks_sport_season_province_idx' and i.indisvalid
  ) then
    raise exception 'SQL59 index missing or invalid';
  end if;
  set local role anon;
  perform count(*) from public.public_ranking_provinces;
  reset role;
end;
$$;

notify pgrst, 'reload schema';

commit;
