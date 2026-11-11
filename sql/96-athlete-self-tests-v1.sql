-- 96-athlete-self-tests-v1.sql
-- Pending: not applied. Staging (vorpnkedpscsqhnrssrl) first. Production (hivedzrwrrcnjrlirhtv)
-- only after the coach or physiotherapist sign-off AND separate owner approval: the functions
-- work whatever the app's NEXT_PUBLIC_SELF_TESTS flag says. Depends on athlete-profile-v2 (athlete_profiles with
-- birth_date), SQL21 (is_accepted_guardian_for) and is_admin(). Order-independent otherwise.
-- Run as postgres. Precheck: sql/96-athlete-self-tests-precheck.sql. Postcheck:
-- sql/96-athlete-self-tests-postcheck.sql. Rollback: sql/96-athlete-self-tests-down.sql.
-- Decision: docs/decisions/ADR-015-athlete-mvp-self-development.md and
-- docs/research/self-tests-2026-11-10.md (owner chose the three tests, 10 Nov 2026; access and
-- careful defaults, 11 Nov 2026).
--
-- Why: the athlete sees real improvement for their goal by repeating three home tests every
-- four weeks: preferred-foot juggling (touches), forearm plank (seconds), standing long jump (cm).
--
-- What it stores: which test, the number, the day. No free text, no pain answer (the pain
-- question is a gate in the app only, as in SQL63), no video. A result is the athlete's own
-- number: never ranked, never on the card, never in Power Rating (AGENTS.md rule 8). Nothing
-- reads it but the athlete, an accepted guardian and an admin.
--
-- Rules the database enforces:
--   * Three tests only, whole numbers within each test's range: juggling 0 to 1000 touches,
--     plank 0 to 120 seconds (a 2-minute stop until the coach review says otherwise), long jump
--     10 to 400 cm.
--   * Long jump only for athletes 12 and over with a birth date on their profile (careful
--     default until the coach review, owner 11 Nov 2026).
--   * One result per test per day (Thailand time). Entering again the same day replaces it, so
--     a retried or corrected request leaves one row. The day is set by the database, so no
--     back-dating.
--   * Only the athlete writes, and only through record_my_self_test() and delete_my_self_test().
--   * PDPA deletion of the athlete profile removes every result (on delete cascade).

begin;

create table if not exists public.athlete_self_tests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  test_key text not null check (test_key in ('juggling', 'plank', 'long_jump')),
  value integer not null,
  test_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (test_key = 'juggling' and value between 0 and 1000)
    or (test_key = 'plank' and value between 0 and 120)
    or (test_key = 'long_jump' and value between 10 and 400)
  ),
  unique (athlete_id, test_key, test_date)
);

-- The unique key above (athlete, test, day) serves every read: one athlete's results per test,
-- newest first.

alter table public.athlete_self_tests enable row level security;

drop policy if exists athlete_self_tests_select on public.athlete_self_tests;
create policy athlete_self_tests_select on public.athlete_self_tests
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or (select public.is_admin())
);

-- No insert, update or delete policy and no table grant for writing: the functions below are
-- the only way in.
revoke all on public.athlete_self_tests from public, anon, authenticated;
grant select on public.athlete_self_tests to authenticated;

create or replace function public.record_my_self_test(p_test text, p_value integer)
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  born date;
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if me is null then
    raise exception 'SELF_TEST_AUTH' using errcode = '42501';
  end if;
  if p_test is null or p_test not in ('juggling', 'plank', 'long_jump') then
    raise exception 'SELF_TEST_UNKNOWN' using errcode = '22023';
  end if;
  if p_value is null
     or (p_test = 'juggling' and p_value not between 0 and 1000)
     or (p_test = 'plank' and p_value not between 0 and 120)
     or (p_test = 'long_jump' and p_value not between 10 and 400) then
    raise exception 'SELF_TEST_VALUE' using errcode = '22023';
  end if;
  select birth_date into born from public.athlete_profiles where user_id = me;
  if not found then
    raise exception 'SELF_TEST_NO_ATHLETE' using errcode = '42501';
  end if;
  if p_test = 'long_jump' and (born is null or born > (today - interval '12 years')::date) then
    raise exception 'SELF_TEST_AGE' using errcode = '42501';
  end if;
  insert into public.athlete_self_tests (athlete_id, test_key, value, test_date)
  values (me, p_test, p_value, today)
  on conflict (athlete_id, test_key, test_date)
  do update set value = excluded.value, updated_at = now();
  return today;
end;
$$;

create or replace function public.delete_my_self_test(p_test text, p_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  removed integer;
begin
  if me is null then
    raise exception 'SELF_TEST_AUTH' using errcode = '42501';
  end if;
  if p_test is null or p_test not in ('juggling', 'plank', 'long_jump') or p_date is null then
    raise exception 'SELF_TEST_UNKNOWN' using errcode = '22023';
  end if;
  delete from public.athlete_self_tests
   where athlete_id = me and test_key = p_test and test_date = p_date;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.record_my_self_test(text, integer) from public, anon;
revoke all on function public.delete_my_self_test(text, date) from public, anon;
grant execute on function public.record_my_self_test(text, integer) to authenticated;
grant execute on function public.delete_my_self_test(text, date) to authenticated;

commit;
