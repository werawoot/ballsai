-- Sandbox only for SQL101 (see sql/checks/101-sandbox-base.sql). Twelve checks, each true when
-- the database lets the app's people do what they should and nothing else: an organizer, two
-- coaches and anon, through RLS as the authenticated and anon roles. Leaves no rows behind.
-- Each line: name | true when the database behaves as the app needs. Run as each person in turn.
\set ON_ERROR_STOP 0
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create temp table result (check_name text, ok boolean);
grant all on result to authenticated, anon;
-- organizer sees the teams of their tournament
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result select 'organizer_sees_teams', (select count(*) from public.teams) = 2;
do $$ declare n int; begin update public.teams set name = name where id = '00000000-0000-4000-8000-0000000000e1'; get diagnostics n = row_count; insert into result values ('organizer_updates_team', n = 1); end $$;
reset role;
-- a coach cannot insert a team straight to confirmed, or into a closed tournament
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1'); set role authenticated;
do $$ begin insert into public.teams (name, tournament_id, created_by, status) values ('sneaky','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','confirmed'); insert into result values ('coach_cannot_insert_confirmed', false); exception when insufficient_privilege then insert into result values ('coach_cannot_insert_confirmed', true); end $$;
do $$ begin insert into public.teams (name, tournament_id, created_by, status) values ('late','00000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-0000000000c1','pending'); insert into result values ('coach_cannot_enter_closed', false); exception when insufficient_privilege then insert into result values ('coach_cannot_enter_closed', true); end $$;
-- a coach cannot create a payment for another coach's team, nor one already confirmed
do $$ begin insert into public.payments (team_id, tournament_id, user_id, amount, status) values ('00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',1,'pending'); insert into result values ('coach_cannot_pay_for_other_team', false); exception when insufficient_privilege then insert into result values ('coach_cannot_pay_for_other_team', true); end $$;
do $$ begin insert into public.payments (team_id, tournament_id, user_id, amount, status) values ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',500,'confirmed'); insert into result values ('coach_cannot_insert_confirmed_payment', false); exception when insufficient_privilege then insert into result values ('coach_cannot_insert_confirmed_payment', true); end $$;
-- the coach's own pending payment for their own team still works (the app's route), then is undone
do $$ begin insert into public.payments (team_id, tournament_id, user_id, amount, status) values ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1',500,'pending'); insert into result values ('coach_pays_own_team', true); exception when others then insert into result values ('coach_pays_own_team', false); end $$;
-- a coach does not see other teams, cannot update teams, and does not see a draft tournament
insert into result select 'coach_sees_only_own_team', (select count(*) from public.teams) = 1;
do $$ declare n int; begin update public.teams set status = 'confirmed' where id = '00000000-0000-4000-8000-0000000000e1'; get diagnostics n = row_count; insert into result values ('coach_cannot_update_team', n = 0); end $$;
insert into result select 'coach_cannot_see_draft_tournament', (select count(*) from public.tournaments where status = 'draft') = 0;
reset role;
-- the organizer sees the coach's payment
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1'); set role authenticated;
insert into result select 'organizer_sees_payment', (select count(*) from public.payments) = 1;
reset role;
-- anon sees open tournaments but not the draft one
set role anon; select pg_temp.as_user('');
insert into result select 'anon_no_draft_tournament', (select count(*) from public.tournaments where status = 'draft') = 0 and (select count(*) from public.tournaments) = 2;
reset role;
delete from public.payments; delete from public.teams where name in ('sneaky','late');
select check_name, ok from result order by check_name;
