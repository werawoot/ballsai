-- Sandbox only for SQL102 (see sql/checks/102-sandbox-base.sql). Fifteen checks, each true when the
-- owner's rules of 21 Nov 2026 hold: a paid team is confirmed only with a confirmed payment; a
-- confirmed team stays confirmed; a rejected team stays rejected; an admin, or the backend with no
-- user, may change anything. Rebuilds its own rows each run and leaves none behind.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to authenticated;
-- Fresh rows: team id ends in the case it is for.
delete from public.payments; delete from public.teams;
insert into public.teams (id, name, tournament_id, created_by, status) values
  ('00000000-0000-4000-8000-000000000101','free pending','00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000102','paid pending, payment pending','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000103','free draft','00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000c2','draft'),
  ('00000000-0000-4000-8000-000000000104','free confirmed','00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000c2','confirmed'),
  ('00000000-0000-4000-8000-000000000105','free pending to reject','00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000106','free rejected','00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000c2','rejected'),
  ('00000000-0000-4000-8000-000000000107','paid rejected, payment pending','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','rejected'),
  ('00000000-0000-4000-8000-000000000108','orphan paid pending','00000000-0000-4000-8000-0000000000f5','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000109','free confirmed for admin','00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000c1','confirmed');
insert into public.payments (id, team_id, tournament_id, user_id, amount, status) values
  ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',500,'pending'),
  ('00000000-0000-4000-8000-000000000207','00000000-0000-4000-8000-000000000107','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'pending'),
  ('00000000-0000-4000-8000-000000000208','00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-0000000000f5','00000000-0000-4000-8000-0000000000c1',300,'pending');
-- One status change as the signed-in person: true when it took effect.
create or replace function pg_temp.moved(p_team text, p_status text) returns boolean language plpgsql as $$
declare n int;
begin
  update public.teams set status = p_status where id = p_team::uuid; get diagnostics n = row_count; return n = 1;
exception when others then raise notice 'teams % to %: %', p_team, p_status, sqlerrm; return false;
end $$;
create or replace function pg_temp.confirmed_payment(p_payment text) returns boolean language plpgsql as $$
begin perform public.confirm_payment_safely(p_payment::uuid); return true; exception when others then raise notice 'confirm_payment_safely(%): %', p_payment, sqlerrm; return false; end $$;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result values ('organizer_confirms_free_pending', pg_temp.moved('00000000-0000-4000-8000-000000000101', 'confirmed'));
insert into result values ('organizer_cannot_confirm_paid_without_payment', not pg_temp.moved('00000000-0000-4000-8000-000000000102', 'confirmed'));
insert into result values ('organizer_cannot_confirm_draft', not pg_temp.moved('00000000-0000-4000-8000-000000000103', 'confirmed'));
insert into result values ('organizer_cannot_reject_confirmed', not pg_temp.moved('00000000-0000-4000-8000-000000000104', 'rejected'));
insert into result values ('organizer_rejects_pending', pg_temp.moved('00000000-0000-4000-8000-000000000105', 'rejected'));
insert into result values ('organizer_cannot_reopen_rejected', not pg_temp.moved('00000000-0000-4000-8000-000000000106', 'pending'));
-- A call and the rows it should leave are checked in two statements: in one, Postgres may read the
-- rows before the call runs.
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000202'));
insert into result select 'confirm_payment_confirms_both', (select ok from result where check_name = '_call')
  and (select status from public.teams where id = '00000000-0000-4000-8000-000000000102') = 'confirmed'
  and (select status from public.payments where id = '00000000-0000-4000-8000-000000000202') = 'confirmed';
delete from result where check_name = '_call';
insert into result values ('confirm_payment_again_is_harmless', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000202'));
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000207'));
insert into result select 'confirm_payment_refuses_rejected_team', not (select ok from result where check_name = '_call')
  and (select status from public.payments where id = '00000000-0000-4000-8000-000000000207') = 'pending'
  and (select status from public.teams where id = '00000000-0000-4000-8000-000000000107') = 'rejected';
delete from result where check_name = '_call';
insert into result values ('organizer_cannot_confirm_payment_of_ownerless_tournament', not pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000208'));
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2'); set role authenticated;
select public.sandbox_submit('00000000-0000-4000-8000-000000000103');
insert into result select 'coach_submits_draft', (select status from public.teams where id = '00000000-0000-4000-8000-000000000103') = 'pending';
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e9'); set role authenticated;
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000208'));
insert into result select 'no_profile_cannot_confirm_payment', not (select ok from result where check_name = '_call');
delete from result where check_name = '_call';
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad'); set role authenticated;
insert into result values ('admin_may_reject_confirmed', pg_temp.moved('00000000-0000-4000-8000-000000000109', 'rejected'));
reset role;

select pg_temp.as_user('');
insert into result values ('backend_may_change_anything', pg_temp.moved('00000000-0000-4000-8000-000000000106', 'pending'));
insert into result values ('status_check_still_holds', not pg_temp.moved('00000000-0000-4000-8000-000000000106', 'nonsense'));

delete from public.payments; delete from public.teams;
select check_name, ok from result order by check_name;
