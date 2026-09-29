-- rollback/58-athlete-private-columns-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes
-- sql/58-athlete-private-columns-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- Use only if SQL58 itself breaks something that a forward fix cannot repair quickly:
-- it puts back the leak SQL58 closed (anyone can read a public athlete's birth date and
-- guardian consent time). The app keeps working either way: it falls back to its older
-- reads when public_athlete_directory, public_athlete_age and my_athlete_private are gone.
--
-- What it does: gives anon and authenticated table-wide SELECT on athlete_profiles again,
-- restores SQL52's public_athlete_rankings (under_18 from birth_date), drops the
-- directory view and both functions. player_ranks_emerging_idx stays: it is harmless.
-- Re-applying SQL58 afterwards works unchanged.

begin;

do $$
begin
  if to_regprocedure('public.public_athlete_age(uuid)') is null then
    raise exception 'SQL58 is not applied here: nothing to roll back';
  end if;
end;
$$;

grant select on public.athlete_profiles to anon, authenticated;

-- SQL52's definition, unchanged: the caller can read birth_date again.
create or replace view public.public_athlete_rankings with (security_invoker = true) as
select
  r.id, r.player_id, r.player_name, r.team, r.province, r.position, r.sport, r.season,
  r.ovr, r.pts, r.pac, r.sho, r.pas, r.dri, r.def, r.rank_change,
  (a.birth_date is not null and a.birth_date > (current_date - interval '18 years')::date) as under_18,
  coalesce(rt.goals, 0) as goals,
  coalesce(rt.assists, 0) as assists,
  coalesce(rt.clean_sheets, 0) as clean_sheets,
  coalesce(rt.mvps, 0) as mvps,
  coalesce(rt.matches_played, 0) as matches_played
from public.player_ranks r
join public.athlete_profiles a on a.user_id = r.player_id and a.sport = r.sport and a.is_public
left join public.player_ratings rt on rt.player_rank_id = r.id and rt.sport = r.sport and rt.season = r.season;

drop view public.public_athlete_directory;
drop function public.my_athlete_private();
drop function public.public_athlete_age(uuid);

do $$
begin
  if not has_column_privilege('anon', 'public.athlete_profiles', 'birth_date', 'SELECT') then
    raise exception 'SQL58 rollback: anon still cannot read athlete_profiles';
  end if;
  if to_regclass('public.public_athlete_directory') is not null
     or to_regprocedure('public.my_athlete_private()') is not null then
    raise exception 'SQL58 rollback left SQL58 objects behind';
  end if;
  set local role anon;
  perform count(*) from public.public_athlete_rankings;
  perform count(birth_date) from public.athlete_profiles;
  reset role;
end;
$$;

notify pgrst, 'reload schema';

commit;
