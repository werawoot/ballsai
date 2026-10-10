-- Rollback for SQL71 only (not part of the apply order). Removes the announcement tables
-- and functions and the reminder column; keeps any notifications already sent but puts the
-- type list back to SQL41's six values after deleting the two SQL71 types.
begin;

do $$
begin
  if to_regclass('public.team_announcements') is null then
    raise exception 'SQL71 is not applied';
  end if;
end;
$$;

drop function if exists public.remind_team_event(uuid);
drop function if exists public.my_team_announcements(integer);
drop function if exists public.mark_team_announcements_read(uuid[]);
drop function if exists public.delete_team_announcement(uuid);
drop function if exists public.post_team_announcement(uuid, uuid, text, boolean, boolean);
drop table if exists public.team_announcement_recipients;
drop table if exists public.team_announcements;
drop function if exists public.is_team_announcement_recipient(uuid);
drop function if exists public.is_team_announcement_author(uuid);
alter table public.team_events drop column if exists reminded_at;
delete from public.notifications where notification_type in ('team_announcement', 'team_event_reminder');
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in ('match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking'));

commit;
