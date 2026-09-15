-- BallDoenSai.com Team Members V1
-- Organizer invites an existing account by email; athlete accepts or declines.
-- Additive migration: never edit previously applied SQL files.

begin;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in ('match_result', 'badge_earned', 'team_status', 'team_invite'));

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'removed')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, athlete_id)
);

create index if not exists team_members_athlete_status_idx
  on public.team_members (athlete_id, status, created_at desc);
create index if not exists team_members_team_status_idx
  on public.team_members (team_id, status, created_at desc);

alter table public.team_members enable row level security;

drop policy if exists "team_members_select_owner_or_member" on public.team_members;
create policy "team_members_select_owner_or_member"
on public.team_members for select to authenticated
using (
  athlete_id = (select auth.uid())
  or invited_by = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = team_members.team_id and tr.organizer_id = (select auth.uid())
  )
);

drop policy if exists "team_members_update_member_or_owner" on public.team_members;
create policy "team_members_update_member_or_owner"
on public.team_members for update to authenticated
using (
  athlete_id = (select auth.uid())
  or invited_by = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = team_members.team_id and tr.organizer_id = (select auth.uid())
  )
)
with check (
  athlete_id = (select auth.uid())
  or invited_by = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = team_members.team_id and tr.organizer_id = (select auth.uid())
  )
);

revoke all on table public.team_members from anon;
grant select, update on table public.team_members to authenticated;

create or replace function public.invite_team_member(p_team_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_athlete_id uuid;
  v_member_id uuid;
  v_team public.teams%rowtype;
begin
  select * into v_team from public.teams t where t.id = p_team_id;
  if v_team.id is null then raise exception 'TEAM_NOT_FOUND'; end if;
  if not (public.is_admin() or exists (
    select 1 from public.tournaments tr where tr.id = v_team.tournament_id and tr.organizer_id = v_user_id
  )) then raise exception 'NOT_ALLOWED'; end if;
  select id into v_athlete_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_athlete_id is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_athlete_id = v_user_id then raise exception 'CANNOT_INVITE_SELF'; end if;

  insert into public.team_members (team_id, athlete_id, invited_by)
  values (p_team_id, v_athlete_id, v_user_id)
  on conflict (team_id, athlete_id) do update
    set status = 'pending', invited_by = excluded.invited_by,
        invited_at = now(), responded_at = null
  returning id into v_member_id;

  perform public.create_notification(
    v_athlete_id, 'team_invite', 'คุณได้รับคำเชิญเข้าทีม',
    'ทีม ' || v_team.name || ' เชิญคุณเข้าร่วมทีม',
    '/team-members', 'team_invite:' || p_team_id::text || ':' || v_athlete_id::text
  );
  return v_member_id;
end;
$$;

revoke all on function public.invite_team_member(uuid, text) from public;
grant execute on function public.invite_team_member(uuid, text) to authenticated;

create or replace function public.respond_team_invite(p_member_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_status not in ('accepted', 'declined') then raise exception 'INVALID_STATUS'; end if;
  update public.team_members
  set status = p_status, responded_at = now()
  where id = p_member_id and athlete_id = auth.uid() and status = 'pending';
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.respond_team_invite(uuid, text) from public;
grant execute on function public.respond_team_invite(uuid, text) to authenticated;

commit;
