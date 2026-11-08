-- 95-training-goals-v1.sql
-- Pending: not applied. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on athlete-profile-v2 (athlete_profiles), SQL21
-- (is_accepted_guardian_for), is_admin() and SQL63 (the training module it serves).
-- Run as postgres. Precheck: sql/95-training-goals-precheck.sql. Postcheck:
-- sql/95-training-goals-postcheck.sql. Rollback: sql/95-training-goals-down.sql.
-- Decision: docs/decisions/ADR-015-athlete-mvp-self-development.md (owner, 8 Nov 2026).
--
-- Why: the athlete MVP is training first. Before choosing a programme the athlete picks one
-- self-development goal from four fixed choices, so the app can suggest the programme that
-- fits and progress can be measured against it.
--
-- What it stores: which goal, since when, and until when it was replaced. No free text (nothing
-- to moderate, nothing personal beyond the choice) and no health data.
--
-- Rules the database enforces:
--   * Four goals only: ball_control, strength, speed, consistency.
--   * At most one current goal per athlete (unique index on the rows not ended).
--   * Only the athlete writes, and only through set_my_training_goal(), which ends the current
--     goal and starts the new one in one transaction. Choosing the current goal again changes
--     nothing, so a retried request has the same effect as one.
--   * The athlete, an accepted guardian and an admin may read; nothing is public, anon has no access.
--   * PDPA deletion of the athlete profile removes every goal (on delete cascade).

begin;

create table if not exists public.athlete_training_goals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  goal_key text not null check (goal_key in ('ball_control', 'strength', 'speed', 'consistency')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists athlete_training_goals_one_current_idx
  on public.athlete_training_goals (athlete_id) where ended_at is null;
create index if not exists athlete_training_goals_athlete_idx
  on public.athlete_training_goals (athlete_id, started_at desc);

alter table public.athlete_training_goals enable row level security;

drop policy if exists athlete_training_goals_select on public.athlete_training_goals;
create policy athlete_training_goals_select on public.athlete_training_goals
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or (select public.is_admin())
);

-- No insert, update or delete policy and no table grant for writing: the function below is the
-- only way in.
revoke all on public.athlete_training_goals from public, anon, authenticated;
grant select on public.athlete_training_goals to authenticated;

create or replace function public.set_my_training_goal(p_goal text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  current_goal text;
  stamp timestamptz;
begin
  if me is null then
    raise exception 'TRAINING_GOAL_AUTH' using errcode = '42501';
  end if;
  if p_goal is null or p_goal not in ('ball_control', 'strength', 'speed', 'consistency') then
    raise exception 'TRAINING_GOAL_UNKNOWN' using errcode = '22023';
  end if;
  if not exists (select 1 from public.athlete_profiles where user_id = me) then
    raise exception 'TRAINING_GOAL_NO_ATHLETE' using errcode = '42501';
  end if;
  -- One writer at a time per athlete, so two taps at once leave one current goal.
  perform pg_advisory_xact_lock(hashtextextended('athlete_training_goal:' || me::text, 0));
  -- The time after the lock, not now() (the transaction's start): a request that waited for the
  -- lock must not end a goal before that goal began.
  stamp := clock_timestamp();
  select goal_key into current_goal from public.athlete_training_goals
   where athlete_id = me and ended_at is null;
  if current_goal = p_goal then
    return p_goal;
  end if;
  update public.athlete_training_goals set ended_at = stamp
   where athlete_id = me and ended_at is null;
  insert into public.athlete_training_goals (athlete_id, goal_key, started_at) values (me, p_goal, stamp);
  return p_goal;
end;
$$;

revoke all on function public.set_my_training_goal(text) from public, anon;
grant execute on function public.set_my_training_goal(text) to authenticated;

commit;
