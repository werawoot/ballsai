-- Rollback for SQL98, Staging (vorpnkedpscsqhnrssrl) only, where the precheck showed
-- functions_present 0 and triggers_present 0. Never on Production: there these objects come
-- from sql/20 and the app needs them.
-- Puts Staging back as it was: tournament registration and submit fail again, and payments and
-- match performances are no longer guarded.

begin;

drop trigger if exists payment_team_pending_guard on public.payments;
drop trigger if exists match_performance_roster_guard on public.match_player_performances;
drop function if exists public.assert_payment_team_is_pending();
drop function if exists public.assert_match_performance_roster_member();
drop function if exists public.submit_tournament_team_safely(uuid);
drop function if exists public.create_tournament_team_safely(uuid, text);

commit;
