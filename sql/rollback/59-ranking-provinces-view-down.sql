-- rollback/59-ranking-provinces-view-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes
-- sql/59-ranking-provinces-view-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- Drops the view and its index. No data is lost. The /ranking filter falls back to
-- offering all 77 provinces. Re-applying SQL59 afterwards works unchanged.

begin;

drop view if exists public.public_ranking_provinces;
drop index if exists public.player_ranks_sport_season_province_idx;

do $$
begin
  if to_regclass('public.public_ranking_provinces') is not null then
    raise exception 'SQL59 rollback left the view behind';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
