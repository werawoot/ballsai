-- BallDoenSai.com notifications V1
-- Apply after the existing core, team, match-result and digital-identity migrations.
-- This migration is additive and intentionally does not modify applied SQL files.

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('match_result', 'badge_earned', 'team_status')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 500),
  href text,
  source_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_owner_select" on public.notifications;
create policy "notifications_owner_select"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_update"
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_source_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, notification_type, title, body, href, source_key)
  values (p_user_id, p_type, p_title, coalesce(p_body, ''), p_href, p_source_key)
  on conflict (source_key) do nothing;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, text) from public;
grant execute on function public.create_notification(uuid, text, text, text, text, text) to authenticated;

create or replace function public.notify_match_result_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.status <> 'confirmed' then return new; end if;
  for v_owner in
    select distinct t.created_by
    from public.teams t
    where t.id in (new.team_a_id, new.team_b_id)
      and t.created_by is not null
  loop
    perform public.create_notification(
      v_owner,
      'match_result',
      'มีผลการแข่งขันใหม่ในระบบ',
      'ผลการแข่งขันได้รับการยืนยันแล้ว และข้อมูลทีมของคุณพร้อมอัปเดต',
      '/dashboard/results',
      'match_result:' || new.id::text || ':' || v_owner::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists match_result_notify_created on public.match_results;
create trigger match_result_notify_created
after insert on public.match_results
for each row execute function public.notify_match_result_created();

create or replace function public.notify_badge_earned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    new.athlete_id,
    'badge_earned',
    'ปลดล็อก Badge ใหม่แล้ว',
    'ผลงานของคุณปลดล็อก ' || replace(new.badge_key, '_', ' ') || ' แล้ว',
    '/career',
    'badge_earned:' || new.athlete_id::text || ':' || new.badge_key
  );
  return new;
end;
$$;

drop trigger if exists athlete_badge_notify_earned on public.athlete_badges;
create trigger athlete_badge_notify_earned
after insert on public.athlete_badges
for each row execute function public.notify_badge_earned();

create or replace function public.notify_team_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  perform public.create_notification(
    new.created_by,
    'team_status',
    'สถานะทีมมีการเปลี่ยนแปลง',
    'ทีม ' || new.name || ' เปลี่ยนสถานะเป็น ' || new.status,
    '/profile',
    'team_status:' || new.id::text || ':' || new.status
  );
  return new;
end;
$$;

drop trigger if exists team_notify_status_changed on public.teams;
create trigger team_notify_status_changed
after update of status on public.teams
for each row execute function public.notify_team_status_changed();

revoke all on table public.notifications from anon;
grant select, update on table public.notifications to authenticated;

commit;
