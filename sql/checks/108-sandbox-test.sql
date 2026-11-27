-- Sandbox only for SQL108 (see sql/checks/108-sandbox-base.sql). Each check is true when running
-- mode V1 (ADR-016, owner 25 Nov 2026) holds: anyone signed in logs their own runs and a weekly
-- goal, alone; a retried save is one run; a run in the future, too fast or out of range is
-- refused; the person and their linked guardian read the runs, nobody else (a coach neither);
-- weekly totals come from the database; the data deletion of /profile removes them.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to anon, authenticated;
select pg_temp.as_user('');
delete from public.run_logs; delete from public.run_goals;

create or replace function pg_temp.ran(p_request text, p_date date, p_m int, p_s int) returns boolean language plpgsql as $$
begin execute 'select public.add_my_run($1, $2, $3, $4)' using p_request::uuid, p_date, p_m, p_s; return true;
exception when others then raise notice 'add_my_run(%, %, %): %', p_date, p_m, p_s, sqlerrm; return false; end $$;
create or replace function pg_temp.runs_seen(p_user text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(1) from public.run_logs where user_id = $1' into n using p_user::uuid; return n;
exception when others then raise notice 'read runs: %', sqlerrm; return -1; end $$;
create or replace function pg_temp.goal_set(p_unit text, p_target int) returns boolean language plpgsql as $$
begin execute 'select public.set_my_run_goal($1, $2)' using p_unit, p_target; return true;
exception when others then raise notice 'set_my_run_goal: %', sqlerrm; return false; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b'); set role authenticated;
insert into result values ('logs_a_run_alone', pg_temp.ran('00000000-0000-4000-8000-000000001001', current_date - 1, 5000, 1800));
insert into result values ('_r', pg_temp.ran('00000000-0000-4000-8000-000000001001', current_date - 1, 5000, 1800));
insert into result select 'a_retried_save_is_one_run', (select ok from result where check_name = '_r') and pg_temp.runs_seen('00000000-0000-4000-8000-00000000000b') = 1;
delete from result where check_name = '_r';
insert into result values ('refuses_a_run_tomorrow', not pg_temp.ran('00000000-0000-4000-8000-000000001002', current_date + 2, 3000, 1200));
insert into result values ('refuses_faster_than_2_30_per_km', not pg_temp.ran('00000000-0000-4000-8000-000000001003', current_date, 10000, 1200));
insert into result values ('refuses_under_100_m', not pg_temp.ran('00000000-0000-4000-8000-000000001004', current_date, 50, 600));
insert into result values ('refuses_over_100_km', not pg_temp.ran('00000000-0000-4000-8000-000000001005', current_date, 120000, 60000));
insert into result values ('_r', pg_temp.ran('00000000-0000-4000-8000-000000001006', current_date, 3000, 1100));
insert into result select 'weekly_totals_from_the_database', (select ok from result where check_name = '_r')
  and (select coalesce(sum(distance_m), 0) from public.my_run_weeks(2)) = 8000
  and (select count(1) from public.my_run_weeks(5)) = 5;
delete from result where check_name = '_r';
insert into result values ('sets_a_weekly_goal', pg_temp.goal_set('km', 15));
insert into result values ('refuses_a_silly_goal', not pg_temp.goal_set('km', 0) and not pg_temp.goal_set('laps', 3));
insert into result select 'a_run_names_its_owner_only', not exists (
  select 1 from (select 1) x where (select public.add_my_run('00000000-0000-4000-8000-000000001007'::uuid, current_date, 1000, 400)) is null)
  and (select count(1) from public.run_logs where user_id <> '00000000-0000-4000-8000-00000000000b') = 0;
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-00000000009a'); set role authenticated;
insert into result values ('linked_guardian_reads_the_runs', pg_temp.runs_seen('00000000-0000-4000-8000-00000000000b') = 3);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000009b'); set role authenticated;
insert into result values ('pending_guardian_reads_nothing', pg_temp.runs_seen('00000000-0000-4000-8000-00000000000b') = 0);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1'); set role authenticated;
insert into result values ('team_coach_reads_nothing', pg_temp.runs_seen('00000000-0000-4000-8000-00000000000b') = 0);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000077'); set role authenticated;
insert into result values ('stranger_reads_nothing', pg_temp.runs_seen('00000000-0000-4000-8000-00000000000b') = 0);
insert into result values ('stranger_logs_their_own_alone', pg_temp.ran('00000000-0000-4000-8000-000000001008', current_date, 2000, 900));
reset role;
select pg_temp.as_user(''); set role anon;
insert into result values ('signed_out_reads_nothing', pg_temp.runs_seen('00000000-0000-4000-8000-00000000000b') <= 0);
insert into result values ('signed_out_logs_nothing', not pg_temp.ran('00000000-0000-4000-8000-000000001009', current_date, 2000, 900));
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-00000000000b'); set role authenticated;
insert into result values ('_r', (select (public.delete_my_athlete_data() ->> 'runsRemoved') = '3'));
reset role;
select pg_temp.as_user('');
insert into result select 'data_deletion_removes_runs_and_goal', coalesce((select ok from result where check_name = '_r'), false)
  and (select count(1) from public.run_logs where user_id = '00000000-0000-4000-8000-00000000000b') = 0
  and (select count(1) from public.run_goals where user_id = '00000000-0000-4000-8000-00000000000b') = 0
  and (select count(1) from public.run_logs where user_id = '00000000-0000-4000-8000-000000000077') = 1;
delete from result where check_name = '_r';

delete from public.run_logs; delete from public.run_goals; delete from public.account_deletion_requests;
insert into public.athlete_profiles values ('00000000-0000-4000-8000-00000000000b','Nong B', true, 150, 47, '2014-01-01') on conflict do nothing;
select check_name, coalesce(ok, false) as ok from result order by check_name;
