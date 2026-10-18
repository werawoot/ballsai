-- Rollback for SQL83, same project, owner approval. Removes join links and requests and the
-- new functions, gives coaches the old removal back, and turns 'left' members into
-- 'removed' so the old status rule holds. Text cleared from teams.members is not restored.

begin;
drop function if exists public.request_to_join_team(text);
drop function if exists public.decide_join_request(uuid, boolean);
drop function if exists public.leave_team(uuid);
drop function if exists public.my_children_team_memberships();
drop function if exists public.remove_team_member(uuid, text, text);
drop function if exists public.team_join_requests_for(uuid);
drop function if exists public.team_join_preview(text);
drop function if exists public.update_team_join_link(uuid, boolean, boolean);
drop function if exists public.my_team_join_link(uuid);
drop function if exists public.expire_team_join_requests(uuid);
drop function if exists public.notify_athlete_and_guardians(uuid, text, text, text, text);
drop table if exists public.team_join_requests;
drop table if exists public.team_join_links;
drop table if exists public.team_member_history;
update public.team_members set status = 'removed' where status = 'left';
alter table public.team_members drop constraint if exists team_members_status_check;
alter table public.team_members add constraint team_members_status_check
  check (status in ('pending', 'accepted', 'declined', 'removed'));
alter table public.team_members drop constraint if exists team_members_removal_reason_check;
alter table public.team_members drop constraint if exists team_members_removal_note_check;
alter table public.team_members drop column if exists removal_reason;
alter table public.team_members drop column if exists removal_note;
alter table public.team_members drop column if exists ended_by;
alter table public.teams drop constraint if exists teams_members_cleared_check;
grant execute on function public.manage_coach_beta(text, uuid, jsonb) to authenticated;
commit;
