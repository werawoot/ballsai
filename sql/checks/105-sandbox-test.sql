-- Sandbox only for SQL105 (see sql/checks/105-sandbox-base.sql). Thirteen checks, each true when
-- the owner's rule of 25 Nov 2026 holds: the organizer rejects a slip with a short reason, the
-- team keeps waiting, a rejected slip is final (it is not confirmed later), and the coach sends a
-- new slip, which the organizer can confirm; a team has at most one payment that is not rejected;
-- an admin may still do anything. Rebuilds its own rows each run, leaves none behind.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to authenticated;
select pg_temp.as_user('');
delete from public.payments; delete from public.teams; delete from storage.objects;
insert into public.teams (id, name, tournament_id, created_by, status) values
  ('00000000-0000-4000-8000-000000000701','c1 rejected then resent','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-000000000702','c2 waiting','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000703','c2 confirmed','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending'),
  ('00000000-0000-4000-8000-000000000704','c2 for the admin','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending');
insert into storage.objects (bucket_id, name, owner_id) values
  ('slips', '00000000-0000-4000-8000-0000000000c1_701_1.png', '00000000-0000-4000-8000-0000000000c1'),
  ('slips', '00000000-0000-4000-8000-0000000000c1_701_2.png', '00000000-0000-4000-8000-0000000000c1'),
  ('slips', '00000000-0000-4000-8000-0000000000c1_701_3.png', '00000000-0000-4000-8000-0000000000c1');
-- Payments made by the backend (no user), as the slip route would make them.
insert into public.payments (id, team_id, tournament_id, user_id, amount, promptpay, slip_url, status) values
  ('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',500,'0812345678','00000000-0000-4000-8000-0000000000c1_701_1.png','pending'),
  ('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'0812345678','00000000-0000-4000-8000-0000000000c2_702_1.png','pending'),
  ('00000000-0000-4000-8000-000000000803','00000000-0000-4000-8000-000000000703','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'0812345678','00000000-0000-4000-8000-0000000000c2_703_1.png','pending'),
  ('00000000-0000-4000-8000-000000000804','00000000-0000-4000-8000-000000000704','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2',500,'0812345678','00000000-0000-4000-8000-0000000000c2_704_1.png','pending');

create or replace function pg_temp.rejected(p_payment text, p_reason text) returns boolean language plpgsql as $$
begin execute 'select public.reject_payment_safely($1, $2)' using p_payment::uuid, p_reason; return true;
exception when others then raise notice 'reject_payment_safely(%): %', p_payment, sqlerrm; return false; end $$;
create or replace function pg_temp.confirmed_payment(p_payment text) returns boolean language plpgsql as $$
begin perform public.confirm_payment_safely(p_payment::uuid); return true; exception when others then raise notice 'confirm_payment_safely(%): %', p_payment, sqlerrm; return false; end $$;
create or replace function pg_temp.paid(p_team text, p_user text, p_slip text) returns boolean language plpgsql as $$
begin
  insert into public.payments (team_id, tournament_id, user_id, amount, promptpay, slip_url, status)
  values (p_team::uuid, '00000000-0000-4000-8000-0000000000f1', p_user::uuid, 500, '0812345678', p_slip, 'pending');
  return true;
exception when others then raise notice 'payment for %: %', p_team, sqlerrm; return false;
end $$;
create or replace function pg_temp.changed(p_payment text, p_set text) returns boolean language plpgsql as $$
declare n int;
begin
  execute format('update public.payments set %s where id = %L', p_set, p_payment); get diagnostics n = row_count; return n = 1;
exception when others then raise notice 'payment set %: %', p_set, sqlerrm; return false;
end $$;

-- Who may reject.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2'); set role authenticated;
insert into result values ('coach_cannot_reject_a_slip', not pg_temp.rejected('00000000-0000-4000-8000-000000000802', 'ยอดไม่ครบ'));
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2'); set role authenticated;
insert into result values ('other_organizer_cannot_reject', not pg_temp.rejected('00000000-0000-4000-8000-000000000802', 'ยอดไม่ครบ'));
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result values ('reject_needs_a_reason', not pg_temp.rejected('00000000-0000-4000-8000-000000000802', '   '));
insert into result values ('reject_reason_is_short', not pg_temp.rejected('00000000-0000-4000-8000-000000000802', repeat('ก', 201)));
insert into result values ('organizer_cannot_write_a_reason_directly', not pg_temp.changed('00000000-0000-4000-8000-000000000802', $$rejection_reason = 'x'$$));
insert into result values ('_call', pg_temp.rejected('00000000-0000-4000-8000-000000000801', '  ยอดไม่ครบ 500 บาท  '));
insert into result select 'organizer_rejects_with_reason_team_waits', (select ok from result where check_name = '_call')
  and (select status = 'rejected' and rejection_reason = 'ยอดไม่ครบ 500 บาท' and rejected_at is not null from public.payments where id = '00000000-0000-4000-8000-000000000801')
  and (select status from public.teams where id = '00000000-0000-4000-8000-000000000701') = 'pending';
delete from result where check_name = '_call';
insert into result values ('rejected_slip_is_not_confirmed_later', not pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000801'));
insert into result values ('rejected_slip_is_not_rejected_again', not pg_temp.rejected('00000000-0000-4000-8000-000000000801', 'อีกครั้ง'));
select pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000803');
insert into result values ('confirmed_slip_cannot_be_rejected', not pg_temp.rejected('00000000-0000-4000-8000-000000000803', 'เปลี่ยนใจ'));
reset role;

-- The coach sends a new slip; only one payment of a team may be open at a time.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1'); set role authenticated;
insert into result values ('coach_sends_a_new_slip_after_rejection', pg_temp.paid('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1_701_2.png'));
insert into result values ('team_has_one_open_payment_only', not pg_temp.paid('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1_701_3.png'));
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result values ('_call', pg_temp.confirmed_payment((select id::text from public.payments where team_id = '00000000-0000-4000-8000-000000000701' and status = 'pending')));
insert into result select 'new_slip_confirms_the_team', (select ok from result where check_name = '_call')
  and (select status from public.teams where id = '00000000-0000-4000-8000-000000000701') = 'confirmed'
  and (select count(1) from public.payments where team_id = '00000000-0000-4000-8000-000000000701' and status = 'rejected') = 1;
delete from result where check_name = '_call';
reset role;

-- An admin may still do anything (owner, 21 Nov 2026).
select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad'); set role authenticated;
select pg_temp.rejected('00000000-0000-4000-8000-000000000804', 'ภาพไม่ชัด');
insert into result values ('admin_may_still_confirm_a_rejected_slip', pg_temp.confirmed_payment('00000000-0000-4000-8000-000000000804'));
reset role;
select pg_temp.as_user('');

delete from public.payments; delete from public.teams; delete from storage.objects;
select check_name, ok from result order by check_name;
