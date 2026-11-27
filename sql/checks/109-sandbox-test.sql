-- Sandbox only for SQL109, after the SQL108 chain (sql/checks/108-sandbox-base.sql) and
-- sql/108-running-log-v1.sql. Before SQL109: 2 of 3 not true; after: 3 of 3. The race itself is
-- sql/checks/109-sandbox-concurrency.sh.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to authenticated;
select pg_temp.as_user('');
delete from public.run_logs;
create or replace function pg_temp.direct(p_date date) returns boolean language plpgsql as $$
begin insert into public.run_logs (user_id, request_id, run_date, distance_m, duration_s) values ('00000000-0000-4000-8000-000000000077', gen_random_uuid(), p_date, 3000, 1200); return true;
exception when others then raise notice 'direct insert: %', sqlerrm; return false; end $$;
create or replace function pg_temp.ran(p_date date) returns boolean language plpgsql as $$
begin perform public.add_my_run(gen_random_uuid(), p_date, 3000, 1200); return true;
exception when others then raise notice 'add_my_run: %', sqlerrm; return false; end $$;
grant execute on all functions in schema pg_temp to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000077'); set role authenticated;
insert into result values ('no_direct_insert_of_a_future_run', not pg_temp.direct(current_date + 30));
insert into result values ('no_direct_insert_at_all', not pg_temp.direct(current_date));
insert into result values ('add_my_run_still_adds', pg_temp.ran(current_date));
reset role;
select pg_temp.as_user('');
delete from public.run_logs;
select check_name, coalesce(ok, false) as ok from result order by check_name;
