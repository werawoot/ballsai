-- Sandbox only for SQL106 (see sql/checks/106-sandbox-base.sql). Eleven checks, each true when the
-- owner's rule of 25 Nov 2026 holds: an athlete's weight is not public; the athlete, their linked
-- guardian, their team's coach and staff, and an admin read it through athlete_weight_kg; anyone
-- else gets nothing; the athlete still saves their own weight.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to anon, authenticated;
create or replace function pg_temp.table_weight() returns numeric language plpgsql as $$
declare w numeric; begin execute 'select weight_kg from public.athlete_profiles where user_id = $1' into w using '00000000-0000-4000-8000-00000000000b'::uuid; return w;
exception when others then raise notice 'table read: %', sqlerrm; return null; end $$;
create or replace function pg_temp.fn_weight() returns numeric language plpgsql as $$
declare w numeric; begin execute 'select public.athlete_weight_kg($1)' into w using '00000000-0000-4000-8000-00000000000b'::uuid; return w;
exception when others then raise notice 'athlete_weight_kg: %', sqlerrm; return null; end $$;
grant execute on function pg_temp.table_weight(), pg_temp.fn_weight() to anon, authenticated;

select pg_temp.as_user(''); set role anon;
insert into result values ('signed_out_cannot_read_weight_from_table', pg_temp.table_weight() is null);
insert into result values ('signed_out_gets_no_weight_from_function', pg_temp.fn_weight() is null);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000000077'); set role authenticated;
insert into result values ('stranger_cannot_read_weight_from_table', pg_temp.table_weight() is null);
insert into result values ('stranger_gets_no_weight', pg_temp.fn_weight() is null);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2'); set role authenticated;
insert into result values ('coach_of_an_invited_only_team_gets_no_weight', pg_temp.fn_weight() is null);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000009b'); set role authenticated;
insert into result values ('pending_guardian_gets_no_weight', pg_temp.fn_weight() is null);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000000b'); set role authenticated;
insert into result values ('athlete_reads_own_weight', pg_temp.fn_weight() = 47);
update public.athlete_profiles set weight_kg = 48 where user_id = '00000000-0000-4000-8000-00000000000b';
insert into result values ('athlete_still_saves_own_weight', pg_temp.fn_weight() = 48);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000009a'); set role authenticated;
insert into result values ('linked_guardian_reads_weight', pg_temp.fn_weight() = 48);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1'); set role authenticated;
insert into result select 'team_coach_and_staff_read_weight', pg_temp.fn_weight() = 48;
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000005a'); set role authenticated;
update result set ok = ok and coalesce(pg_temp.fn_weight() = 48, false) where check_name = 'team_coach_and_staff_read_weight';
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad'); set role authenticated;
insert into result values ('admin_reads_weight', pg_temp.fn_weight() = 48);
reset role;
select pg_temp.as_user('');
update public.athlete_profiles set weight_kg = 47 where user_id = '00000000-0000-4000-8000-00000000000b';
select check_name, coalesce(ok, false) as ok from result order by check_name;
