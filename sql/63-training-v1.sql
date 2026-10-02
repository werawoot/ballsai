-- 63-training-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on athlete-profile-v2 (athlete_profiles),
-- SQL21 (is_accepted_guardian_for) and is_admin(). Order-independent otherwise.
-- Run as postgres. Precheck: sql/63-training-v1-precheck.sql. Spec: docs/training-flow-v1.md.
--
-- Why: athletes pick a training programme, choose weekdays and check in sessions.
-- The programmes themselves live in the repo (content/training/programs.json); the
-- database only keeps who follows which programme and which days they trained.
--
-- What it does NOT store, on purpose:
--   * No pain answer. "Any pain right now?" is a gate in the app only (PDPA: a minor's
--     health data). Nothing here has a column for it.
--   * No XP. Training is self-reported; match XP (athlete_xp_events) comes only from
--     verified match records and stays that way. Training progress is counted from
--     check-ins and shown separately (AGENTS.md rule 8).
--
-- Rules the database enforces:
--   * Only the athlete writes their own rows; an accepted guardian and an admin may read;
--     nothing is public and anon has no access.
--   * Only the programmes an athlete may start alone can be started here. Coach-assigned
--     programmes (hip and groin, U16+) are not in the list and need a later file with
--     coach assignments.
--   * One active enrollment per programme, at most 3 active programmes per athlete.
--   * One check-in per enrollment per day (a retried "Done" changes nothing), only for
--     an active enrollment, and only for today or the 6 days before (Thailand time):
--     no back-filling a season of training.
--   * Deleting the athlete profile (PDPA deletion) removes all of it (on delete cascade).

create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  program_id text not null check (program_id ~ '^[a-z0-9-]{3,64}$'),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 6 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'stopped', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists training_enrollments_one_active_idx
  on public.training_enrollments (athlete_id, program_id) where status = 'active';
create index if not exists training_enrollments_athlete_idx
  on public.training_enrollments (athlete_id, created_at desc);

create table if not exists public.training_checkins (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  session_date date not null,
  drills_done smallint not null check (drills_done between 0 and 50),
  created_at timestamptz not null default now(),
  unique (enrollment_id, session_date)
);

create index if not exists training_checkins_athlete_date_idx
  on public.training_checkins (athlete_id, session_date desc);

-- The programmes an athlete may start alone. Adding one is a new SQL file, reviewed with
-- the content pull request that adds it.
create or replace function public.training_self_start_programs()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['u10-foundation-01', 'u10-ball-mastery-01', 'u14-prevention-01', 'u14-game-skills-01']::text[] $$;

-- Thailand's calendar day, for the check-in window.
create or replace function public.training_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

-- At most 3 active programmes. The advisory lock makes two simultaneous starts wait for
-- each other, so both cannot pass the count.
create or replace function public.training_enrollments_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended('training:' || new.athlete_id::text, 0));
    if (select count(*) from public.training_enrollments e
        where e.athlete_id = new.athlete_id and e.status = 'active' and e.id <> new.id) >= 3 then
      raise exception 'TRAINING_ACTIVE_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists training_enrollments_limit on public.training_enrollments;
create trigger training_enrollments_limit
before insert or update of status on public.training_enrollments
for each row execute function public.training_enrollments_limit();

alter table public.training_enrollments enable row level security;
alter table public.training_checkins enable row level security;

drop policy if exists training_enrollments_select on public.training_enrollments;
create policy training_enrollments_select on public.training_enrollments
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or (select public.is_admin())
);

drop policy if exists training_enrollments_insert on public.training_enrollments;
create policy training_enrollments_insert on public.training_enrollments
for insert to authenticated
with check (
  athlete_id = (select auth.uid())
  and status = 'active'
  and program_id = any (public.training_self_start_programs())
  and start_date between public.training_today() and public.training_today() + 14
);

drop policy if exists training_enrollments_update on public.training_enrollments;
create policy training_enrollments_update on public.training_enrollments
for update to authenticated
using (athlete_id = (select auth.uid()))
with check (athlete_id = (select auth.uid()));

drop policy if exists training_enrollments_delete on public.training_enrollments;
create policy training_enrollments_delete on public.training_enrollments
for delete to authenticated
using (athlete_id = (select auth.uid()));

drop policy if exists training_checkins_select on public.training_checkins;
create policy training_checkins_select on public.training_checkins
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or (select public.is_admin())
);

drop policy if exists training_checkins_insert on public.training_checkins;
create policy training_checkins_insert on public.training_checkins
for insert to authenticated
with check (
  athlete_id = (select auth.uid())
  and session_date between public.training_today() - 6 and public.training_today()
  and exists (
    select 1 from public.training_enrollments e
    where e.id = enrollment_id and e.athlete_id = (select auth.uid()) and e.status = 'active'
  )
);

drop policy if exists training_checkins_delete on public.training_checkins;
create policy training_checkins_delete on public.training_checkins
for delete to authenticated
using (athlete_id = (select auth.uid()));

revoke all on public.training_enrollments, public.training_checkins from public, anon;
revoke all on public.training_enrollments, public.training_checkins from authenticated;
grant select, insert, delete on public.training_enrollments, public.training_checkins to authenticated;
-- Only the weekdays and the status change after a start; never whose or which programme.
grant update (weekdays, status) on public.training_enrollments to authenticated;

revoke all on function public.training_self_start_programs() from public;
revoke all on function public.training_today() from public;
revoke all on function public.training_enrollments_limit() from public, anon, authenticated;
grant execute on function public.training_self_start_programs() to authenticated;
grant execute on function public.training_today() to authenticated;
