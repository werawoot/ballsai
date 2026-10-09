-- 69-coach-skill-assessments-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL18 (team_members), SQL20 (accepted roster) and
-- athlete-profile-v2 (athlete_skill_assessments). Run as postgres.
-- Precheck: sql/69-coach-skill-assessments-precheck.sql.
--
-- Why: a coach rates an athlete's skills (speed, stamina, strength, technique, vision,
-- 0-99, or left unassessed). It follows SQL47's rule for anything labelled coach
-- verified: the coach proposes, and ONLY the athlete's own acceptance turns it into an
-- athlete_skill_assessments row with source_level 'coach_verified' (shown on the card as
-- "coach assessed"). A declined or unanswered rating changes nothing anyone else sees.
--
--   * coach_skill_assessments: one proposal per row. Readable by the athlete, the coach
--     who wrote it and admins; nobody writes it directly (functions only).
--   * submit_coach_skill_assessment(team, athlete, skills): the caller must have created
--     the team (an admin is deliberately not enough, as in SQL47) and the athlete must be
--     an accepted member. At least one skill; each 0-99 or null (not assessed). A new
--     proposal replaces the coach's own pending one for that athlete, so a retry or a
--     double tap leaves one pending row.
--   * respond_coach_skill_assessment(id, status): only the athlete; pending only. On
--     accept, writes the athlete_skill_assessments row (assessor = the coach) in the
--     same transaction and links it.
-- PDPA: no free text, no evidence links, nothing beyond five numbers. Deleting the
-- athlete's account cascades; deleting the team cascades its proposals; an accepted
-- assessment stays with the athlete's profile like any other assessment.

begin;

do $$
begin
  if to_regclass('public.team_members') is null
     or to_regclass('public.athlete_skill_assessments') is null
     or to_regclass('public.teams') is null then
    raise exception 'Prerequisites missing: team_members (SQL18) and athlete_skill_assessments (athlete-profile-v2)';
  end if;
end;
$$;

create table if not exists public.coach_skill_assessments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  speed smallint check (speed between 0 and 99),
  stamina smallint check (stamina between 0 and 99),
  strength smallint check (strength between 0 and 99),
  technique smallint check (technique between 0 and 99),
  vision smallint check (vision between 0 and 99),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  assessment_id bigint references public.athlete_skill_assessments(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (coalesce(speed, stamina, strength, technique, vision) is not null),
  check ((status = 'pending') = (responded_at is null))
);

-- One pending proposal per team and athlete: a retry replaces it, never adds one.
create unique index if not exists coach_skill_assessments_one_pending_idx
  on public.coach_skill_assessments (team_id, athlete_id) where status = 'pending';
create index if not exists coach_skill_assessments_athlete_idx
  on public.coach_skill_assessments (athlete_id, created_at desc);
create index if not exists coach_skill_assessments_team_idx
  on public.coach_skill_assessments (team_id, athlete_id, created_at desc);

alter table public.coach_skill_assessments enable row level security;
revoke all on table public.coach_skill_assessments from public, anon, authenticated;
grant select on table public.coach_skill_assessments to authenticated;

drop policy if exists coach_skill_assessments_select_parties on public.coach_skill_assessments;
create policy coach_skill_assessments_select_parties
on public.coach_skill_assessments
for select
to authenticated
using (
  athlete_id = (select auth.uid())
  or coach_id = (select auth.uid())
  or (select public.is_admin())
);

create or replace function public.submit_coach_skill_assessment(p_team_id uuid, p_athlete_id uuid, p_skills jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_values smallint[];
  v_key text;
  v_value jsonb;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_skills is null or jsonb_typeof(p_skills) <> 'object' then
    raise exception 'INVALID_SKILLS' using errcode = '22023';
  end if;
  -- Only these five keys; each a whole number 0-99 or null.
  for v_key, v_value in select key, value from jsonb_each(p_skills) loop
    if v_key not in ('speed', 'stamina', 'strength', 'technique', 'vision') then
      raise exception 'INVALID_SKILLS' using errcode = '22023';
    end if;
    if jsonb_typeof(v_value) <> 'null' and (
      jsonb_typeof(v_value) <> 'number'
      or (v_value #>> '{}')::numeric <> floor((v_value #>> '{}')::numeric)
      or (v_value #>> '{}')::numeric not between 0 and 99
    ) then
      raise exception 'INVALID_SKILLS' using errcode = '22023';
    end if;
  end loop;
  v_values := array[
    (p_skills ->> 'speed')::smallint, (p_skills ->> 'stamina')::smallint, (p_skills ->> 'strength')::smallint,
    (p_skills ->> 'technique')::smallint, (p_skills ->> 'vision')::smallint
  ];
  if array_remove(v_values, null) = '{}' then
    raise exception 'NO_SKILL_ASSESSED' using errcode = '22023';
  end if;

  -- The team's creator only: an assessment is the coach's first-hand judgement.
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = v_user) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Lock the membership row: concurrent submits for the same athlete queue here, so the
  -- replace below never races into the one-pending index (20 parallel calls: 0 errors).
  perform 1 from public.team_members tm
  where tm.team_id = p_team_id and tm.athlete_id = p_athlete_id and tm.status = 'accepted'
  for update;
  if not found then
    raise exception 'ATHLETE_NOT_ON_TEAM' using errcode = '42501';
  end if;
  if not exists (select 1 from public.athlete_profiles ap where ap.user_id = p_athlete_id) then
    raise exception 'ATHLETE_PROFILE_REQUIRED' using errcode = '22023';
  end if;

  -- Replace this coach's own pending proposal, if any (one pending per team and athlete).
  delete from public.coach_skill_assessments
  where team_id = p_team_id and athlete_id = p_athlete_id and status = 'pending';

  insert into public.coach_skill_assessments (team_id, athlete_id, coach_id, speed, stamina, strength, technique, vision)
  values (p_team_id, p_athlete_id, v_user, v_values[1], v_values[2], v_values[3], v_values[4], v_values[5])
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_coach_skill_assessment(p_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.coach_skill_assessments%rowtype;
  v_assessment bigint;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'declined') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select * into v_row from public.coach_skill_assessments where id = p_id for update;
  if not found or v_row.athlete_id <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'ALREADY_ANSWERED' using errcode = '55000';
  end if;

  if p_status = 'accepted' then
    insert into public.athlete_skill_assessments (athlete_id, speed, stamina, strength, technique, vision, source_level, assessor_id)
    values (v_row.athlete_id, v_row.speed, v_row.stamina, v_row.strength, v_row.technique, v_row.vision, 'coach_verified', v_row.coach_id)
    returning id into v_assessment;
  end if;

  update public.coach_skill_assessments
  set status = p_status, responded_at = now(), assessment_id = v_assessment
  where id = p_id;
  return p_id;
end;
$$;

revoke all on function public.submit_coach_skill_assessment(uuid, uuid, jsonb) from public, anon;
revoke all on function public.respond_coach_skill_assessment(uuid, text) from public, anon;
grant execute on function public.submit_coach_skill_assessment(uuid, uuid, jsonb) to authenticated;
grant execute on function public.respond_coach_skill_assessment(uuid, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.submit_coach_skill_assessment(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.respond_coach_skill_assessment(uuid, text)', 'execute')
     or has_table_privilege('anon', 'public.coach_skill_assessments', 'select')
     or has_table_privilege('authenticated', 'public.coach_skill_assessments', 'insert')
     or has_table_privilege('authenticated', 'public.coach_skill_assessments', 'update') then
    raise exception 'SQL69 privileges are wider than intended';
  end if;
end;
$$;

commit;
