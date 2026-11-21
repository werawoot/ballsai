-- 101-teams-payments-rls-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Precheck: sql/101-teams-payments-rls-precheck.sql. Postcheck: sql/101-teams-payments-rls-postcheck.sql.
-- Rollback on Production: sql/101-teams-payments-rls-down-production.sql (Staging is unchanged by
-- this file, so it needs none).
--
-- Why (owner, 21 Nov 2026: "แก้ RLS ก่อน แล้วค่อยกติกาสถานะ"): Production still carries the
-- policies on teams, payments and tournaments from before sql/supabase-rls.sql (runbook step 3);
-- Staging carries that file's. Read on 21 Nov 2026, Production's teams policies are only
-- "Players can create teams" (with check created_by = auth.uid()) and "Players can view own
-- teams". So, on Production:
--   - an organizer cannot read the teams of their own tournament: the /dashboard queue is empty,
--     and /api/teams/<id>/status answers "not found";
--   - nobody may update a team, so the organizer's confirm of a free team changes nothing;
--   - any signed-in user may insert a team in any tournament, open or closed, with any status,
--     confirmed included;
--   - any signed-in user may insert a payment for any team, in any state, with any amount;
--     one payment per team (payments_one_payment_per_team_idx) then blocks the real one;
--   - "Anyone can view tournaments" (using true) shows draft tournaments to everyone.
-- What: the old policies are dropped, and the seven of sql/supabase-rls.sql that Production lacks
-- are created, word for word as that file and Staging have them. tournaments_select_public and
-- tournaments_insert_organizer are already the same on both projects and are not touched. No
-- table, row, function or other table's policy changes. On Staging this drops nothing and
-- recreates seven identical policies.
-- Rows today (Production, 21 Nov 2026): 3 teams, all draft; 0 payments; 4 tournaments.

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.payments') is null or to_regclass('public.tournaments') is null then
    raise exception 'SQL101 needs public.teams, public.payments and public.tournaments';
  end if;
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.is_organizer()') is null then
    raise exception 'SQL101 needs public.is_admin() and public.is_organizer() (sql/supabase-rls.sql)';
  end if;
end;
$$;

alter table public.teams enable row level security;
alter table public.payments enable row level security;
alter table public.tournaments enable row level security;

-- The policies from before sql/supabase-rls.sql, as found on Production.
drop policy if exists "Players can create teams" on public.teams;
drop policy if exists "Players can view own teams" on public.teams;
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Users can view own payments" on public.payments;
drop policy if exists "Organizers can view payments for their tournaments" on public.payments;
drop policy if exists "Organizers can update payment status" on public.payments;
drop policy if exists "Anyone can view tournaments" on public.tournaments;
drop policy if exists "Organizer can create tournaments" on public.tournaments;
drop policy if exists "Organizer can update own tournaments" on public.tournaments;

-- sql/supabase-rls.sql, unchanged.
drop policy if exists "teams_select_owner_organizer_admin" on public.teams;
create policy "teams_select_owner_organizer_admin"
on public.teams
for select
to authenticated
using (
  created_by = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "teams_insert_creator_for_open_tournament" on public.teams;
create policy "teams_insert_creator_for_open_tournament"
on public.teams
for insert
to authenticated
with check (
  created_by = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.status = 'open'
  )
);

drop policy if exists "teams_update_organizer_admin" on public.teams;
create policy "teams_update_organizer_admin"
on public.teams
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.organizer_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "payments_select_owner_organizer_admin" on public.payments;
create policy "payments_select_owner_organizer_admin"
on public.payments
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = payments.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "payments_insert_owner_for_own_team" on public.payments;
create policy "payments_insert_owner_for_own_team"
on public.payments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = payments.team_id
      and t.created_by = auth.uid()
      and tr.status = 'open'
      and t.tournament_id = payments.tournament_id
  )
);

drop policy if exists "payments_update_organizer_admin" on public.payments;
create policy "payments_update_organizer_admin"
on public.payments
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = payments.tournament_id
      and tr.organizer_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = payments.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "tournaments_update_owner_or_admin" on public.tournaments;
create policy "tournaments_update_owner_or_admin"
on public.tournaments
for update
to authenticated
using (
  organizer_id = auth.uid()
  or public.is_admin()
)
with check (
  organizer_id = auth.uid()
  or public.is_admin()
);

commit;
