-- Rollback for SQL72 only (not part of the apply order). Removes the plans table and its
-- functions, deletes the plan notifications and puts the type list back to SQL71's eight.
begin;

do $$
begin
  if to_regclass('public.team_training_plans') is null then
    raise exception 'SQL72 is not applied';
  end if;
end;
$$;

drop function if exists public.my_team_training_plans();
drop function if exists public.save_team_training_plan(uuid, date, jsonb, boolean);
drop function if exists public.bangkok_week_start(timestamptz);
drop table if exists public.team_training_plans;
delete from public.notifications where notification_type = 'team_training_plan';
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder'
  ));

commit;
