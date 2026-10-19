-- Rollback for SQL86, same project, owner approval. Removes the new triggers and functions,
-- puts back sql/17's notify_badge_earned and notify_team_status_changed unchanged, deletes
-- the hall_of_fame notifications (the only rows the old type list would refuse) and narrows
-- the type list back to sql/72's. Notifications already sent for matches and badges stay.

begin;

drop trigger if exists match_performance_notify_family on public.match_player_performances;
drop trigger if exists match_result_notify_voided on public.match_results;
drop trigger if exists hall_of_fame_notify_entry on public.hall_of_fame_entries;
drop function if exists public.notify_match_performance_created();
drop function if exists public.notify_match_result_voided();
drop function if exists public.notify_hall_of_fame_entry();
drop function if exists public.notify_athlete_family(uuid, text, text, text, text, text);
drop function if exists public.match_score_line(uuid);

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

delete from public.notifications where notification_type = 'hall_of_fame';
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder', 'team_training_plan'
  ));

commit;
