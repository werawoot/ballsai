-- 70-team-events-down.sql
-- Rollback of SQL70 only if it must be undone. Drops team events, answers and attendance
-- with their functions. Keeps the SQL69 PDPA foreign key (removing it would bring the
-- erasure gap back). Run as postgres.

begin;

do $$
begin
  if to_regclass('public.team_events') is null then
    raise exception 'SQL70 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop function if exists public.my_upcoming_team_events(integer);
drop function if exists public.set_team_attendance(uuid, uuid[]);
drop function if exists public.respond_team_event(uuid, uuid, text);
drop function if exists public.cancel_team_event(uuid);
drop function if exists public.save_team_event(uuid, uuid, text, text, timestamptz, text, text);
drop table if exists public.team_event_attendance;
drop table if exists public.team_event_responses;
drop table if exists public.team_events;
drop function if exists public.can_view_team_events(uuid);
drop function if exists public.is_team_creator(uuid);

commit;
