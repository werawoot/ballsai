-- 58-athlete-private-columns-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Apply after SQL52, SQL53 and AFTER SQL50 (SQL50
-- removes signed-out EXECUTE from definer functions that exist when it runs; the age
-- reader below must stay callable signed out). Run as postgres.
--
-- Why (T50): row-level security decides which athlete_profiles rows a caller sees, not
-- which columns. A public profile is readable by anyone, so today anyone can ask the REST
-- API for the full birth date and the guardian consent time of every public athlete, most
-- of them children. The site only ever shows an age.
--
-- What:
--   * anon and authenticated keep SELECT on every athlete_profiles column except
--     birth_date and guardian_consent_at. INSERT and UPDATE are unchanged, so athletes
--     still save their own birth date (the app writes it with a plain insert or update:
--     an upsert would need SELECT on it).
--   * public_athlete_age(user): the age in whole years, Bangkok date, of a public
--     profile, or of the caller's own profile, or any profile for an admin; else null.
--   * my_athlete_private(): the caller's own birth date and consent time, for /profile.
--   * public_athlete_directory: the /athletes listing, public profiles only, with age
--     and no birth date. security_invoker, so the caller's RLS still applies.
--   * public_athlete_rankings (SQL52) is recreated with the same columns: under_18 now
--     comes from public_athlete_age, because the view runs as the caller and the caller
--     can no longer read birth_date.
--
--   * player_ranks_emerging_idx: the ดาวรุ่ง tab (under_18, by rank_change) now asks the
--     age function per row; walking ranks in the tab's order stops after 50 minors instead
--     of checking every ranked athlete. Sandbox, 100,000 public ranked athletes: 1.2 s
--     without the index, 6 ms with it; the /athletes age filter reads a 25-row page in
--     2-3 ms (58 ms at page 100). Plain CREATE INDEX blocks writes to player_ranks while
--     it builds; see SQL53's note for large tables.
--
-- A column added to athlete_profiles later is NOT readable by anon or authenticated until
-- a file grants it: grant select (new_column) on public.athlete_profiles to anon, authenticated.

begin;

do $$
begin
  if to_regclass('public.public_athlete_rankings') is null then raise exception 'SQL58 needs SQL52 applied first'; end if;
  if exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
             where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'public'
               and d.defaclobjtype = 'f' and d.defaclacl::text like '%anon=X%') then
    raise exception 'SQL58 needs SQL50 applied first';
  end if;
end;
$$;

create function public.public_athlete_age(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select date_part('year', age((now() at time zone 'Asia/Bangkok')::date, a.birth_date))::integer
  from public.athlete_profiles a
  where a.user_id = p_user_id
    and a.birth_date is not null
    and (a.is_public or a.user_id = (select auth.uid()) or (select public.is_admin()));
$$;

create function public.my_athlete_private()
returns table (birth_date date, guardian_consent_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.birth_date, a.guardian_consent_at
  from public.athlete_profiles a
  where a.user_id = (select auth.uid());
$$;

revoke all on function public.public_athlete_age(uuid) from public, anon, authenticated;
revoke all on function public.my_athlete_private() from public, anon, authenticated;
grant execute on function public.public_athlete_age(uuid) to anon, authenticated, service_role;
grant execute on function public.my_athlete_private() to authenticated, service_role;

-- Same columns, names, types and order as SQL52; only under_18 changes source.
create or replace view public.public_athlete_rankings with (security_invoker = true) as
select
  r.id, r.player_id, r.player_name, r.team, r.province, r.position, r.sport, r.season,
  r.ovr, r.pts, r.pac, r.sho, r.pas, r.dri, r.def, r.rank_change,
  coalesce(public.public_athlete_age(a.user_id) < 18, false) as under_18,
  coalesce(rt.goals, 0) as goals,
  coalesce(rt.assists, 0) as assists,
  coalesce(rt.clean_sheets, 0) as clean_sheets,
  coalesce(rt.mvps, 0) as mvps,
  coalesce(rt.matches_played, 0) as matches_played
from public.player_ranks r
join public.athlete_profiles a on a.user_id = r.player_id and a.sport = r.sport and a.is_public
left join public.player_ratings rt on rt.player_rank_id = r.id and rt.sport = r.sport and rt.season = r.season;

create index if not exists player_ranks_emerging_idx
  on public.player_ranks (sport, season, rank_change desc, pts desc, id);

-- The /athletes page: ordered by (sport, created_at desc, user_id), which SQL53 indexes.
create view public.public_athlete_directory with (security_invoker = true) as
select
  a.user_id, a.display_name, public.public_athlete_age(a.user_id) as age,
  a.position, a.province, a.current_team, a.profile_image_url, a.verification_level,
  a.sport, a.created_at
from public.athlete_profiles a
where a.is_public;

revoke all on public.public_athlete_directory from public, anon, authenticated;
grant select on public.public_athlete_directory to anon, authenticated, service_role;

comment on view public.public_athlete_directory is
  'Public athlete profiles for /athletes, with age and never birth_date. Caller RLS applies (security_invoker). sql/58.';
comment on view public.public_athlete_rankings is
  'Public athlete profiles with their rank and season stats for /ranking. Caller RLS applies (security_invoker). Carries under_18, never birth_date. sql/52, under_18 from public_athlete_age since sql/58.';

-- The column privileges. The list is read from the live table, so a production column
-- this repository does not know about keeps working.
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'athlete_profiles'
    and column_name not in ('birth_date', 'guardian_consent_at');
  execute 'revoke select on public.athlete_profiles from public, anon, authenticated';
  execute 'revoke select (birth_date, guardian_consent_at) on public.athlete_profiles from public, anon, authenticated';
  execute format('grant select (%s) on public.athlete_profiles to anon, authenticated', v_columns);
end;
$$;

-- Self-check. Any failure rolls the whole file back.
do $$
declare
  v_bad text;
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(v_role, 'public.athlete_profiles', 'birth_date', 'SELECT')
       or has_column_privilege(v_role, 'public.athlete_profiles', 'guardian_consent_at', 'SELECT') then
      raise exception 'SQL58 left % able to read birth_date or guardian_consent_at', v_role;
    end if;
    select string_agg(column_name, ', ') into v_bad
    from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_profiles'
      and column_name not in ('birth_date', 'guardian_consent_at')
      and not has_column_privilege(v_role, 'public.athlete_profiles', column_name, 'SELECT');
    if v_bad is not null then raise exception 'SQL58 took % read access to: %', v_role, v_bad; end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.athlete_profiles', 'birth_date', 'UPDATE') then
    raise exception 'SQL58 expects athletes to still update their own birth_date';
  end if;

  select string_agg(table_name || '.' || column_name, ', ') into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name in ('public_athlete_directory', 'public_athlete_rankings')
    and column_name in ('birth_date', 'guardian_consent_at', 'bio', 'height_cm', 'weight_kg');
  if v_bad is not null then raise exception 'SQL58 views expose: %', v_bad; end if;

  if not has_function_privilege('anon', 'public.public_athlete_age(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_athlete_private()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_athlete_private()', 'EXECUTE') then
    raise exception 'SQL58 function privileges are wrong';
  end if;

  -- Signed out, the pages' reads still work and the birth date does not.
  set local role anon;
  perform count(*) from public.public_athlete_rankings;
  perform count(*) from public.public_athlete_directory;
  perform count(user_id) from public.athlete_profiles;
  begin
    perform birth_date from public.athlete_profiles limit 1;
    raise exception 'SQL58 anon can still read birth_date';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

notify pgrst, 'reload schema';

commit;
