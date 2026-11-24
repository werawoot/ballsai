-- Sandbox only for SQL103 (see sql/checks/103-sandbox-base.sql). Eleven checks, each true when the
-- owner's rule of 24 Nov 2026 holds: a payment is confirmed only through confirm_payment_safely and
-- only with a slip; a new payment carries a slip; an admin, or the backend with no user, may still
-- do anything. Rebuilds its own rows each run and leaves none behind.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to authenticated;
select pg_temp.as_user('');
delete from public.payments; delete from public.teams;
insert into public.teams (id, name, tournament_id, created_by, status) values
  ('00000000-0000-4000-8000-000000000301','paid pending A','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000302','paid pending B','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000303','paid pending, no slip','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000304','paid rejected','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000305','coach new payment','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000306','coach slipless payment','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000307','coach empty-slip payment','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending');
insert into public.payments (id, team_id, tournament_id, user_id, amount, slip_url, status) values
  ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',500,'c1_a.png','pending'),
  ('00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'c2_b.png','pending'),
  ('00000000-0000-4000-8000-000000000403','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',500,null,'pending'),
  ('00000000-0000-4000-8000-000000000404','00000000-0000-4000-8000-000000000304','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'c2_d.png','pending');
update public.teams set status = 'rejected' where id = '00000000-0000-4000-8000-000000000304';

create or replace function pg_temp.payment_moved(p_payment text, p_status text) returns boolean language plpgsql as $$
declare n int;
begin
  update public.payments set status = p_status where id = p_payment::uuid; get diagnostics n = row_count; return n = 1;
exception when others then raise notice 'payment % to %: %', p_payment, p_status, sqlerrm; return false;
end $$;
create or replace function pg_temp.confirmed_payment(p_payment text) returns boolean language plpgsql as $$
begin perform public.confirm_payment_safely(p_payment::uuid); return true; exception when others then raise notice 'confirm_payment_safely(%): %', p_payment, sqlerrm; return false; end $$;
-- A payment as the slip route makes it. Once SQL104's sandbox has added Storage and the PromptPay
-- columns, the slip is uploaded first and the tournament's PromptPay copied, as the route does, so
-- this file checks SQL103's rules alone before and after SQL104.
create or replace function pg_temp.inserted_payment(p_team text, p_user text, p_slip text) returns boolean language plpgsql as $$
begin
  if to_regclass('storage.objects') is not null and nullif(p_slip, '') is not null then
    execute 'insert into storage.objects (bucket_id, name, owner_id) values (''slips'', $1, $2)' using p_slip, p_user;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = 'promptpay') then
    execute 'insert into public.payments (team_id, tournament_id, user_id, amount, promptpay, slip_url, status)
      select $1, tr.id, $2, 500, coalesce(tr.promptpay, ''''), $3, ''pending'' from public.tournaments tr where tr.id = ''00000000-0000-4000-8000-0000000000f1'''
      using p_team::uuid, p_user::uuid, p_slip;
  else
    insert into public.payments (team_id, tournament_id, user_id, amount, slip_url, status)
    values (p_team::uuid, '00000000-0000-4000-8000-0000000000f1', p_user::uuid, 500, p_slip, 'pending');
  end if;
  return true;
exception when others then raise notice 'insert payment for %: %', p_team, sqlerrm; return false;
end $$;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result values ('organizer_cannot_confirm_payment_directly', not pg_temp.payment_moved('00000000-0000-4000-8000-000000000401', 'confirmed'));
insert into result select 'organizer_direct_update_left_team_waiting', (select status from public.teams where id = '00000000-0000-4000-8000-000000000301') = 'pending'
  and not pg_temp.payment_moved('00000000-0000-4000-8000-000000000401', 'confirmed');
insert into result values ('organizer_cannot_unconfirm_or_edit_status', not pg_temp.payment_moved('00000000-0000-4000-8000-000000000402', 'rejected'));
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000402'));
insert into result select 'confirm_payment_with_slip_confirms_both', (select ok from result where check_name = '_call')
  and (select status from public.payments where id = '00000000-0000-4000-8000-000000000402') = 'confirmed'
  and (select status from public.teams where id = '00000000-0000-4000-8000-000000000302') = 'confirmed';
delete from result where check_name = '_call';
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000403'));
insert into result select 'confirm_payment_without_slip_refused', not (select ok from result where check_name = '_call');
delete from result where check_name = '_call';
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1'); set role authenticated;
insert into result values ('coach_inserts_payment_with_slip', pg_temp.inserted_payment('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1_x.png'));
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2'); set role authenticated;
insert into result values ('coach_cannot_insert_payment_without_slip', not pg_temp.inserted_payment('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-0000000000c2', null));
insert into result values ('coach_cannot_insert_payment_with_empty_slip', not pg_temp.inserted_payment('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-0000000000c2', ''));
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad'); set role authenticated;
insert into result values ('_call', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000404'));
insert into result select 'admin_confirms_payment_of_rejected_team_team_stays', (select ok from result where check_name = '_call')
  and (select status from public.teams where id = '00000000-0000-4000-8000-000000000304') = 'rejected';
delete from result where check_name = '_call';
insert into result values ('admin_may_update_payment_directly', pg_temp.payment_moved('00000000-0000-4000-8000-000000000403', 'confirmed'));
reset role;

select pg_temp.as_user('');
insert into result values ('backend_may_update_payment', pg_temp.payment_moved('00000000-0000-4000-8000-000000000401', 'pending'));

delete from public.payments; delete from public.teams;
do $$ begin if to_regclass('storage.objects') is not null then execute 'delete from storage.objects'; end if; end $$;
select check_name, ok from result order by check_name;
