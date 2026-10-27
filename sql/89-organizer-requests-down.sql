-- Rollback for SQL89, same project, owner approval only.
-- It deletes every organizer request and revocation record, and turns every draft
-- tournament into a closed one (a draft has no teams: registration needs status open).
-- Roles already granted stay as they are. Run the app's previous version first, or the
-- request form and /admin/organizers will show "not ready" (they handle the missing
-- functions). The status check comes back as open and closed under the name
-- tournaments_status_check; if the precheck recorded a different name, rename it after.

begin;

drop trigger if exists tournaments_guard_organizer on public.tournaments;
drop function if exists public.tournaments_guard_organizer();
drop function if exists public.request_organizer_access(text, text, text, text, text);
drop function if exists public.decide_organizer_request(uuid, boolean, text);
drop function if exists public.revoke_organizer_access(uuid, text);
drop function if exists public.public_tournament_organizers(uuid[]);

update public.tournaments set status = 'closed' where status = 'draft';
alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments add constraint tournaments_status_check check (status in ('open', 'closed'));

drop policy if exists "tournaments_select_public" on public.tournaments;
create policy "tournaments_select_public" on public.tournaments
for select to anon, authenticated using (true);

drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments
for insert to authenticated with check (public.is_organizer() and organizer_id = auth.uid());

delete from public.notifications
where notification_type in ('organizer_request', 'organizer_decision', 'tournament_closed');
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder', 'team_training_plan', 'hall_of_fame'
  ));

drop table if exists public.organizer_revocations;
drop table if exists public.organizer_requests;

commit;
