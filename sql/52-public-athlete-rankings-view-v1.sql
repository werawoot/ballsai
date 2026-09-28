-- 52-public-athlete-rankings-view-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Needs Postgres 15+ (security_invoker views); Supabase
-- runs 15 or newer. Depends on athlete-profile-v2 and ballsai-rating-v1.
--
-- Why (T09): the ดาวรุ่ง and MVP tabs on /ranking read up to 500 public athlete profiles
-- in no defined order, then ranked only those. Past 500 public athletes the real leaders
-- could silently be missing. player_ranks and athlete_profiles have no foreign key between
-- them, so PostgREST cannot join them; this view does, and lib/public-identity-ranking.ts
-- asks it for the top 50 of each tab, sorted in the database.
--
-- Privacy: every row is an athlete, often a minor, shown to signed-out visitors.
--   * security_invoker = true: the caller's RLS on player_ranks, athlete_profiles and
--     player_ratings applies, exactly as for the direct reads it replaces.
--   * a.is_public in the join: only public profiles, even for a signed-in owner or admin
--     whose RLS would let them see a private profile.
--   * under_18 is a flag computed here; the birth date itself never leaves the database.
--     The old code fetched raw birth dates of public athletes to the server.
--   * readers get SELECT only.

begin;

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

revoke all on public.public_athlete_rankings from public, anon, authenticated;
grant select on public.public_athlete_rankings to anon, authenticated, service_role;

comment on view public.public_athlete_rankings is
  'Public athlete profiles with their rank and season stats for /ranking. Caller RLS applies (security_invoker). Carries under_18, never birth_date. sql/52.';

do $$
declare
  v_bad text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'public_athlete_rankings' and c.relkind = 'v'
      and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
  ) then
    raise exception 'SQL52 view missing or not security_invoker';
  end if;

  select string_agg(column_name, ', ') into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'public_athlete_rankings'
    and column_name in ('birth_date', 'guardian_consent_at', 'bio', 'height_cm', 'weight_kg', 'display_name');
  if v_bad is not null then
    raise exception 'SQL52 view exposes profile columns: %', v_bad;
  end if;

  if not has_table_privilege('anon', 'public.public_athlete_rankings', 'SELECT')
     or has_table_privilege('anon', 'public.public_athlete_rankings', 'INSERT')
     or has_table_privilege('anon', 'public.public_athlete_rankings', 'UPDATE')
     or has_table_privilege('anon', 'public.public_athlete_rankings', 'DELETE')
     or has_table_privilege('authenticated', 'public.public_athlete_rankings', 'INSERT')
     or has_table_privilege('authenticated', 'public.public_athlete_rankings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.public_athlete_rankings', 'DELETE') then
    raise exception 'SQL52 view privileges are not SELECT-only for anon and authenticated';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
