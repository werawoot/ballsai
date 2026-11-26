-- 106-athlete-weight-private-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Needs SQL58 (athlete_profiles SELECT granted column by column), sql/21 (is_accepted_guardian_for),
-- sql/18 (team_members) and sql/75 (is_team_staff).
-- Precheck: sql/106-athlete-weight-private-precheck.sql. Postcheck: sql/106-athlete-weight-private-postcheck.sql.
-- Rollback: sql/106-athlete-weight-private-down.sql.
--
-- Why (owner, 25 Nov 2026: "ซ่อนจากหน้าสาธารณะ", who may see it: the athlete, their guardian and
-- their team's coach): a weight is health data, a sensitive category under PDPA, and most athletes
-- are children. Read on 26 Nov 2026, anon and authenticated may SELECT athlete_profiles.weight_kg on
-- both projects, so anyone, signed out included, could read the weight of every public athlete
-- through the REST API, and /players/[id] showed it. Production: 2 profiles with a weight, both
-- public.
-- What:
--   - anon and authenticated lose SELECT on athlete_profiles.weight_kg (as SQL58 did for the birth
--     date). INSERT and UPDATE are unchanged: the athlete still saves their own weight;
--   - athlete_weight_kg(athlete): the weight, for the athlete, an accepted guardian
--     (is_accepted_guardian_for), the head coach or accepted staff of a team the athlete has
--     accepted (is_team_staff), or an admin; null for anyone else. Not callable signed out.
-- No row, table or policy changes.

begin;

do $$
begin
  if to_regclass('public.athlete_profiles') is null or to_regclass('public.team_members') is null
     or to_regprocedure('public.is_accepted_guardian_for(uuid)') is null
     or to_regprocedure('public.is_team_staff(uuid)') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL106 needs athlete_profiles, team_members, is_accepted_guardian_for, is_team_staff and is_admin';
  end if;
  if has_table_privilege('anon', 'public.athlete_profiles', 'SELECT')
     or has_table_privilege('authenticated', 'public.athlete_profiles', 'SELECT') then
    raise exception 'SQL106 expects SQL58: SELECT on athlete_profiles granted column by column, not on the table';
  end if;
end;
$$;

revoke select (weight_kg) on public.athlete_profiles from anon, authenticated;

create or replace function public.athlete_weight_kg(p_athlete_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select ap.weight_kg
  from public.athlete_profiles ap
  where ap.user_id = p_athlete_id
    and (
      ap.user_id = (select auth.uid())
      or public.is_admin()
      or public.is_accepted_guardian_for(p_athlete_id)
      or exists (
        select 1 from public.team_members tm
        where tm.athlete_id = p_athlete_id and tm.status = 'accepted' and public.is_team_staff(tm.team_id)
      )
    );
$$;

revoke all on function public.athlete_weight_kg(uuid) from public, anon;
grant execute on function public.athlete_weight_kg(uuid) to authenticated, service_role;

commit;
