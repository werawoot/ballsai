-- Sandbox only for SQL104 (see sql/checks/104-sandbox-base.sql). Thirteen checks, each true when
-- the owner's rule of 24 Nov 2026 ("ทำ sql/104") holds: a new payment names a slip that was
-- uploaded to the slips bucket by its payer, for the tournament's fee; a payment's fields do not
-- change after it is made, except its status through confirm_payment_safely; an admin, or the
-- backend with no user, may still do anything. Rebuilds its own rows each run, leaves none behind.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to authenticated;
select pg_temp.as_user('');
delete from public.payments; delete from public.teams; delete from storage.objects;
insert into public.teams (id, name, tournament_id, created_by, status) values
  ('00000000-0000-4000-8000-000000000501','c1 paid A','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000502','c2 paid B','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000503','c2 paid C','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000504','c2 paid D','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000505','c2 paid E','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000506','c2 paid F','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000507','c1 paid G','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000508','c2 paid H, no payment','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending');
-- Each insert check has a team of its own: one payment per team (payments_one_payment_per_team_idx)
-- would otherwise refuse a later check for the wrong reason.
insert into storage.objects (bucket_id, name, owner_id) values
  ('slips', '00000000-0000-4000-8000-0000000000c1_501_1.png', '00000000-0000-4000-8000-0000000000c1'),
  ('slips', '00000000-0000-4000-8000-0000000000c2_502_1.png', '00000000-0000-4000-8000-0000000000c2'),
  ('avatars', '00000000-0000-4000-8000-0000000000c2_wrong_bucket.png', '00000000-0000-4000-8000-0000000000c2');
-- One payment already made (as the backend) for the organizer checks.
insert into public.payments (id, team_id, tournament_id, user_id, amount, promptpay, slip_url, status) values
  ('00000000-0000-4000-8000-000000000602','00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'0812345678','00000000-0000-4000-8000-0000000000c2_502_1.png','pending');

create or replace function pg_temp.paid(p_team text, p_user text, p_amount numeric, p_slip text) returns boolean language plpgsql as $$
begin
  insert into public.payments (team_id, tournament_id, user_id, amount, promptpay, slip_url, status)
  values (p_team::uuid, '00000000-0000-4000-8000-0000000000f1', p_user::uuid, p_amount, '0812345678', p_slip, 'pending');
  return true;
exception when others then raise notice 'payment for %: %', p_team, sqlerrm; return false;
end $$;
create or replace function pg_temp.changed(p_set text) returns boolean language plpgsql as $$
declare n int;
begin
  execute format('update public.payments set %s where id = %L', p_set, '00000000-0000-4000-8000-000000000602'); get diagnostics n = row_count; return n = 1;
exception when others then raise notice 'payment set %: %', p_set, sqlerrm; return false;
end $$;
create or replace function pg_temp.confirmed_payment(p_payment text) returns boolean language plpgsql as $$
begin perform public.confirm_payment_safely(p_payment::uuid); return true; exception when others then raise notice 'confirm_payment_safely(%): %', p_payment, sqlerrm; return false; end $$;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2'); set role authenticated;
insert into result values ('coach_cannot_name_a_slip_never_uploaded', not pg_temp.paid('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-0000000000c2', 500, '00000000-0000-4000-8000-0000000000c2_ghost.png'));
insert into result values ('coach_cannot_use_another_payers_slip', not pg_temp.paid('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-0000000000c2', 500, '00000000-0000-4000-8000-0000000000c1_501_1.png'));
insert into result values ('coach_cannot_use_an_object_of_another_bucket', not pg_temp.paid('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-0000000000c2', 500, '00000000-0000-4000-8000-0000000000c2_wrong_bucket.png'));
insert into result values ('coach_cannot_name_a_url', not pg_temp.paid('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-0000000000c2', 500, 'https://example.com/slip.png'));
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1'); set role authenticated;
insert into result values ('coach_cannot_pay_less_than_the_fee', not pg_temp.paid('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-0000000000c1', 1, '00000000-0000-4000-8000-0000000000c1_501_1.png'));
insert into result values ('coach_pays_with_own_uploaded_slip', pg_temp.paid('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-0000000000c1', 500, '00000000-0000-4000-8000-0000000000c1_501_1.png'));
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result values ('organizer_cannot_change_amount', not pg_temp.changed('amount = 1'));
insert into result values ('organizer_cannot_move_payment_to_another_team', not pg_temp.changed($$team_id = '00000000-0000-4000-8000-000000000508'$$));
insert into result values ('organizer_cannot_swap_the_slip', not pg_temp.changed($$slip_url = '00000000-0000-4000-8000-0000000000c1_501_1.png'$$));
insert into result values ('organizer_same_values_is_no_change', pg_temp.changed('amount = amount'));
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000602'));
insert into result select 'confirm_payment_still_confirms', (select ok from result where check_name = '_call')
  and (select status from public.payments where id = '00000000-0000-4000-8000-000000000602') = 'confirmed';
delete from result where check_name = '_call';
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad'); set role authenticated;
insert into result values ('admin_may_change_a_payment', pg_temp.changed('amount = 450'));
reset role;
select pg_temp.as_user('');
insert into result values ('backend_may_change_a_payment', pg_temp.changed('amount = 500'));

delete from public.payments; delete from public.teams; delete from storage.objects;
select check_name, ok from result order by check_name;
