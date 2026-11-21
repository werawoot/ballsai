-- Rollback of SQL101 on Production only (hivedzrwrrcnjrlirhtv): puts back the policies found there
-- on 21 Nov 2026, word for word, and removes the seven SQL101 created. This brings back every hole
-- SQL101 closed (see the main file); use it only if SQL101 breaks something and say what.
-- Staging was not changed by SQL101 and must not run this file.

begin;

drop policy if exists "teams_select_owner_organizer_admin" on public.teams;
drop policy if exists "teams_insert_creator_for_open_tournament" on public.teams;
drop policy if exists "teams_update_organizer_admin" on public.teams;
drop policy if exists "payments_select_owner_organizer_admin" on public.payments;
drop policy if exists "payments_insert_owner_for_own_team" on public.payments;
drop policy if exists "payments_update_organizer_admin" on public.payments;
drop policy if exists "tournaments_update_owner_or_admin" on public.tournaments;

create policy "Players can create teams" on public.teams for insert with check (auth.uid() = created_by);
create policy "Players can view own teams" on public.teams for select using (auth.uid() = created_by);
create policy "Users can insert own payments" on public.payments for insert with check (user_id = auth.uid());
create policy "Users can view own payments" on public.payments for select using (user_id = auth.uid());
create policy "Organizers can view payments for their tournaments" on public.payments for select
  using (exists (select 1 from public.tournaments where tournaments.id = payments.tournament_id and tournaments.organizer_id = auth.uid()));
create policy "Organizers can update payment status" on public.payments for update
  using (exists (select 1 from public.tournaments where tournaments.id = payments.tournament_id and tournaments.organizer_id = auth.uid()));
create policy "Anyone can view tournaments" on public.tournaments for select using (true);
create policy "Organizer can create tournaments" on public.tournaments for insert with check (auth.uid() = organizer_id);
create policy "Organizer can update own tournaments" on public.tournaments for update using (auth.uid() = organizer_id);

commit;
