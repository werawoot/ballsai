-- 73-coach-notes-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL18/20 (team_members), SQL21 (is_accepted_guardian_for) and
-- athlete_profiles. Run as postgres.
-- Precheck: sql/73-coach-notes-precheck.sql.
--
-- Why: coach tools round 5. A coach writes short development notes about an athlete on
-- their team. Built to docs/research/coach-notes-pdpa-2026-10-10.md (research, not legal
-- advice; its lawyer questions stay open), which the owner chose to follow ("ก"):
--   * No private notes. The athlete and their accepted guardian read every note about
--     the athlete (PDPA s. 30 right of access would hand it over on request anyway). The
--     coach who wrote it reads it only while they own the team and the athlete is still an
--     accepted member. Admins read a note only once the athlete or guardian reports it.
--     Never public, never on the card.
--   * A fixed category (technical, tactical, physical, teamwork, goal) and at most 280
--     characters. Health, injury, illness, medicine and similar words are refused here,
--     in the database (PDPA s. 26 sensitive data needs explicit consent this feature does
--     not collect); lib/coach-notes.ts holds the same list for the screen.
--   * One note per athlete and category every 7 days per team; the id comes from the app,
--     so a retried save is the same note.
--   * Each note expires 12 months after it is written: expired notes are invisible at
--     once (RLS) and deleted on the next write, so nobody has to clean up by hand.
--   * The athlete or guardian can delete a note (erasure, s. 33) or report it.
--   * Deleting the athlete's profile (delete_my_athlete_data) deletes every note about
--     them; deleting the team deletes its notes.

begin;

do $$
begin
  if to_regclass('public.team_members') is null
     or to_regclass('public.athlete_profiles') is null
     or to_regprocedure('public.is_accepted_guardian_for(uuid)') is null then
    raise exception 'Prerequisites missing: SQL18/20 team_members, SQL21 guardian links, athlete_profiles';
  end if;
end;
$$;

create table if not exists public.coach_athlete_notes (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('technical', 'tactical', 'physical', 'teamwork', 'goal')),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 months'),
  reported_at timestamptz
);
create index if not exists coach_athlete_notes_athlete_idx on public.coach_athlete_notes (athlete_id, created_at desc);
create index if not exists coach_athlete_notes_team_idx on public.coach_athlete_notes (team_id, athlete_id, category, created_at desc);
create index if not exists coach_athlete_notes_expires_idx on public.coach_athlete_notes (expires_at);

-- The first health or medical word in a text, or null. Thai words are matched anywhere;
-- English ones at the start of a word. Kept in step with lib/coach-notes.ts (a test
-- compares the two lists).
create or replace function public.coach_note_health_word(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select w from unnest(array[
      'เจ็บ', 'ปวด', 'ป่วย', 'ไข้', 'หมอ', 'แพทย์', 'พยาบาล', 'คลินิก', 'กินยา', 'ทานยา', 'ใช้ยา', 'ยาแก้',
      'ผ่าตัด', 'กระดูก', 'แพลง', 'เคล็ด', 'ข้อเท้าพลิก', 'อักเสบ', 'หอบหืด', 'ภูมิแพ้', 'แพ้อาหาร', 'แพ้ยา', 'เบาหวาน',
      'โรค', 'อาการ', 'สมาธิสั้น', 'ซึมเศร้า', 'ออทิสติก', 'พิการ', 'ประจำเดือน', 'ตั้งครรภ์'
    ]) as w where position(w in coalesce(p_text, '')) > 0 limit 1),
    substring(lower(coalesce(p_text, '')) from '\m(injur|hurt|pain|sick|illness|medic|doctor|hospital|clinic|surgery|fracture|sprain|concussion|asthma|allerg|diabet|adhd|autis|depress|anxiety|disab|pregnan)')
  );
$$;

alter table public.coach_athlete_notes enable row level security;
revoke all on table public.coach_athlete_notes from public, anon, authenticated;
grant select on table public.coach_athlete_notes to authenticated;

-- The coach may read a note only while they own the team and the athlete is still on it.
create or replace function public.can_coach_read_note(p_team_id uuid, p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t
    join public.team_members tm on tm.team_id = t.id and tm.athlete_id = p_athlete_id and tm.status = 'accepted'
    where t.id = p_team_id and t.created_by = (select auth.uid())
  );
$$;

drop policy if exists coach_athlete_notes_select_parties on public.coach_athlete_notes;
create policy coach_athlete_notes_select_parties on public.coach_athlete_notes for select to authenticated
using (
  expires_at > now()
  and (
    athlete_id = (select auth.uid())
    or (select public.is_accepted_guardian_for(athlete_id))
    or (coach_id = (select auth.uid()) and (select public.can_coach_read_note(team_id, athlete_id)))
    or (reported_at is not null and (select public.is_admin()))
  )
);

create or replace function public.write_coach_note(p_id uuid, p_team_id uuid, p_athlete_id uuid, p_category text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_existing public.coach_athlete_notes%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_id is null or p_category not in ('technical', 'tactical', 'physical', 'teamwork', 'goal')
     or char_length(v_body) not between 1 and 280 then
    raise exception 'INVALID_NOTE' using errcode = '22023';
  end if;
  if public.coach_note_health_word(v_body) is not null then
    raise exception 'HEALTH_WORDS' using errcode = '22023';
  end if;
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = v_user) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Lock the membership row: concurrent writes for this athlete queue, so the 7-day rule holds.
  perform 1 from public.team_members tm
  where tm.team_id = p_team_id and tm.athlete_id = p_athlete_id and tm.status = 'accepted'
  for update;
  if not found or not exists (select 1 from public.athlete_profiles ap where ap.user_id = p_athlete_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A retry of the same note: the same answer, nothing new stored.
  select * into v_existing from public.coach_athlete_notes where id = p_id;
  if found then
    if v_existing.coach_id <> v_user or v_existing.team_id <> p_team_id or v_existing.athlete_id <> p_athlete_id then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
    return p_id;
  end if;

  -- Expired notes go now: retention needs no manual step.
  delete from public.coach_athlete_notes where expires_at <= now();

  if exists (
    select 1 from public.coach_athlete_notes n
    where n.team_id = p_team_id and n.athlete_id = p_athlete_id and n.category = p_category
      and n.created_at > now() - interval '7 days'
  ) then
    raise exception 'NOTE_TOO_SOON' using errcode = '22023';
  end if;

  insert into public.coach_athlete_notes (id, team_id, athlete_id, coach_id, category, body)
  values (p_id, p_team_id, p_athlete_id, v_user, p_category, v_body);
  return p_id;
end;
$$;

-- The coach who wrote it (while they may read it), the athlete or their guardian.
create or replace function public.delete_coach_note(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.coach_athlete_notes%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_note from public.coach_athlete_notes where id = p_id for update;
  if not found or not (
    v_note.athlete_id = auth.uid()
    or public.is_accepted_guardian_for(v_note.athlete_id)
    or (v_note.coach_id = auth.uid() and public.can_coach_read_note(v_note.team_id, v_note.athlete_id))
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  delete from public.coach_athlete_notes where id = p_id;
  return p_id;
end;
$$;

-- The athlete or their guardian flags a note; an admin can then read it.
create or replace function public.report_coach_note(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select n.athlete_id into v_athlete from public.coach_athlete_notes n where n.id = p_id and n.expires_at > now();
  if v_athlete is null or not (v_athlete = auth.uid() or public.is_accepted_guardian_for(v_athlete)) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.coach_athlete_notes set reported_at = coalesce(reported_at, now()) where id = p_id;
  return p_id;
end;
$$;

-- The notes about the caller and their accepted children, with the team's name, newest
-- first. A function because an athlete or guardian cannot read the teams table.
create or replace function public.my_coach_notes(p_limit integer default 50)
returns table (id uuid, team_name text, athlete_id uuid, athlete_name text, category text, body text,
               created_at timestamptz, expires_at timestamptz, reported boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with athletes as (
    select (select auth.uid()) as athlete_id
    union
    select gl.athlete_id from public.guardian_links gl
    where gl.guardian_id = (select auth.uid()) and gl.status = 'accepted' and gl.consent_at is not null
  )
  select n.id, t.name, n.athlete_id, coalesce(nullif(ap.display_name, ''), ''), n.category, n.body,
         n.created_at, n.expires_at, n.reported_at is not null
  from athletes a
  join public.coach_athlete_notes n on n.athlete_id = a.athlete_id and n.expires_at > now()
  join public.teams t on t.id = n.team_id
  left join public.athlete_profiles ap on ap.user_id = n.athlete_id
  where (select auth.uid()) is not null
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.coach_note_health_word(text) from public, anon;
revoke all on function public.can_coach_read_note(uuid, uuid) from public, anon;
revoke all on function public.write_coach_note(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.delete_coach_note(uuid) from public, anon;
revoke all on function public.report_coach_note(uuid) from public, anon;
revoke all on function public.my_coach_notes(integer) from public, anon;
grant execute on function public.coach_note_health_word(text) to authenticated;
grant execute on function public.can_coach_read_note(uuid, uuid) to authenticated;
grant execute on function public.write_coach_note(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_coach_note(uuid) to authenticated;
grant execute on function public.report_coach_note(uuid) to authenticated;
grant execute on function public.my_coach_notes(integer) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.write_coach_note(uuid, uuid, uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.my_coach_notes(integer)', 'execute')
     or has_function_privilege('anon', 'public.delete_coach_note(uuid)', 'execute')
     or has_table_privilege('anon', 'public.coach_athlete_notes', 'select')
     or has_table_privilege('authenticated', 'public.coach_athlete_notes', 'insert')
     or has_table_privilege('authenticated', 'public.coach_athlete_notes', 'update')
     or has_table_privilege('authenticated', 'public.coach_athlete_notes', 'delete') then
    raise exception 'SQL73 privileges are wider than intended';
  end if;
end;
$$;

commit;
