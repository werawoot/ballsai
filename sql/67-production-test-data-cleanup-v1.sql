-- 67-production-test-data-cleanup-v1.sql
-- Production (hivedzrwrrcnjrlirhtv) only, with owner approval. Data, not schema.
-- Why: a read-only check on 8 Oct 2026 found test data on Production that real testers
-- would see:
--   12 teams in the 2 seed tournaments that SQL66 closed (names such as "ดดดด", "fff",
--      "hgggg", created 1-2 Mar 2026, plus one draft from 20 Aug), shown on the owner's
--      /team-members, /dashboard and /match-plan;
--   3 published venues named "TEST — Venue Flow" (15-16 Sep 2026), shown on public /venues;
--   3 booking requests ("ซ้อมทีม") on those venues.
-- What: deletes the 3 bookings (and any coordination rows on them), the 3 venues (their
-- courts, slots and photo rows cascade) and the 12 teams (team_members and match plans
-- cascade; payments on them, if any, are deleted first). Nothing else is touched.
-- Guarded: refuses unless it finds exactly 12 teams, 3 venues, 3 bookings on those venues
-- and no match result. Photo files in storage, if any, are not removed (none were seen).
-- Code lines are plain ASCII with no comments, so they can be typed by hand.

begin;

do $$
declare
  v_teams integer;
  v_venues integer;
  v_bookings integer;
begin
  select count(*) into v_teams from public.teams
  where tournament_id in (select id from public.tournaments where status = 'closed' and created_at::date = date '2026-03-01');
  select count(*) into v_venues from public.venue_profiles
  where name like 'TEST%Venue Flow%' and created_at::date between date '2026-09-15' and date '2026-09-16';
  select count(*) into v_bookings from public.venue_booking_requests b
  join public.venue_slots s on s.id = b.slot_id
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where v.name like 'TEST%Venue Flow%';
  if v_teams <> 12 or v_venues <> 3 or v_bookings <> 3 then
    raise exception 'SQL67: expected 12 teams, 3 venues, 3 bookings; found %, %, %', v_teams, v_venues, v_bookings;
  end if;
  if exists (select 1 from public.match_results) then
    raise exception 'SQL67: match results exist, stop and review by hand';
  end if;

  create temporary table sql67_bookings on commit drop as
  select b.id from public.venue_booking_requests b
  join public.venue_slots s on s.id = b.slot_id
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where v.name like 'TEST%Venue Flow%';
  create temporary table sql67_teams on commit drop as
  select id from public.teams
  where tournament_id in (select id from public.tournaments where status = 'closed' and created_at::date = date '2026-03-01');

  if to_regclass('public.venue_booking_coordination') is not null then
    execute 'delete from public.venue_booking_coordination where booking_id in (select id from sql67_bookings)';
  end if;
  delete from public.venue_booking_requests where id in (select id from sql67_bookings);
  delete from public.venue_profiles
  where name like 'TEST%Venue Flow%' and created_at::date between date '2026-09-15' and date '2026-09-16';

  if to_regclass('public.payments') is not null then
    execute 'delete from public.payments where team_id in (select id from sql67_teams)';
  end if;
  delete from public.teams where id in (select id from sql67_teams);

  if exists (select 1 from public.venue_profiles where name like 'TEST%Venue Flow%')
     or exists (select 1 from public.teams t join public.tournaments r on r.id = t.tournament_id
                where r.status = 'closed' and r.created_at::date = date '2026-03-01') then
    raise exception 'SQL67: test data still present after cleanup';
  end if;
end;
$$;

commit;
