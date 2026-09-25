-- BallDoenSai.com notification + team member privilege hardening V1
-- Apply after 17-notifications-v1.sql and 18-team-members-v1.sql.
-- This is deliberately additive: do not edit migrations that are already applied.

begin;

-- Notifications are created only by database triggers and controlled RPCs.  An
-- authenticated browser must not be able to create arbitrary notifications for
-- another account by calling the SECURITY DEFINER helper directly.
revoke all on function public.create_notification(uuid, text, text, text, text, text) from public;
revoke all on function public.create_notification(uuid, text, text, text, text, text) from authenticated;

-- A notification recipient may only acknowledge it.  Do not let a browser alter
-- its type, text, destination, source key, owner, or creation time.
revoke update on public.notifications from public;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Team membership changes are intentionally routed through the two guarded RPCs:
-- invite_team_member() and respond_team_invite().  Direct UPDATE previously let
-- an authorized viewer modify identity or status columns outside that workflow.
drop policy if exists "team_members_update_member_or_owner" on public.team_members;
revoke update on public.team_members from public;
revoke update on public.team_members from authenticated;

commit;
