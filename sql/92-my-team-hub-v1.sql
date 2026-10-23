-- 92-my-team-hub-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on functions already applied on both projects: sql/70
-- (my_upcoming_team_events), sql/71 (my_team_announcements), sql/72 (my_team_training_plans),
-- sql/73 (my_coach_notes), sql/74 (my_match_minutes), sql/75 (my_staff_teams, my_team_staff),
-- sql/78 (my_entry_rosters), sql/82 (my_team_memberships), sql/83
-- (my_children_team_memberships). Precheck: sql/92-my-team-hub-precheck.sql. Postcheck:
-- sql/92-my-team-hub-postcheck.sql. Rollback: sql/92-my-team-hub-down.sql.
--
-- Why (T59, structural review 23 Oct 2026): /team-members called ten "my_..." functions one
-- after another, each waiting for the last, besides its table reads: about thirteen round
-- trips in a row for every athlete, guardian and coach who opens it.
-- What: one function that calls the same ten functions with the same limits the page used
-- and returns their rows as one JSON object, one key per function. It adds no read of its
-- own: it is SECURITY INVOKER, and each inner function keeps its own rules (all of them
-- read only the caller's own rows, their children's under accepted guardian links, or the
-- teams they coach). The app falls back to the ten separate calls while this is missing.
-- Rows keep each function's own order (WITH ORDINALITY).
-- Scale: the inner functions are unchanged and keep their own caps (30 events, 10
-- announcements, 50 notes, 50 entries, 100 memberships, ...).

begin;

do $$
begin
  if to_regprocedure('public.my_entry_rosters(integer)') is null
     or to_regprocedure('public.my_team_memberships(integer)') is null
     or to_regprocedure('public.my_upcoming_team_events(integer)') is null
     or to_regprocedure('public.my_children_team_memberships()') is null
     or to_regprocedure('public.my_team_announcements(integer)') is null
     or to_regprocedure('public.my_team_training_plans()') is null
     or to_regprocedure('public.my_coach_notes(integer)') is null
     or to_regprocedure('public.my_match_minutes()') is null
     or to_regprocedure('public.my_staff_teams()') is null
     or to_regprocedure('public.my_team_staff()') is null then
    raise exception 'SQL92 needs SQL70-75, SQL78, SQL82 and SQL83 applied first';
  end if;
end;
$$;

create or replace function public.my_team_hub()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'entries',       (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_entry_rosters(50) with ordinality x),
    'memberships',   (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_team_memberships(100) with ordinality x),
    'events',        (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_upcoming_team_events(30) with ordinality x),
    'child_teams',   (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_children_team_memberships() with ordinality x),
    'news',          (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_team_announcements(10) with ordinality x),
    'plans',         (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_team_training_plans() with ordinality x),
    'notes',         (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_coach_notes(50) with ordinality x),
    'minutes',       (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_match_minutes() with ordinality x),
    'staff_teams',   (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_staff_teams() with ordinality x),
    'team_staff',    (select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) from public.my_team_staff() with ordinality x)
  );
$$;

revoke all on function public.my_team_hub() from public, anon;
grant execute on function public.my_team_hub() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.my_team_hub()', 'execute') then
    raise exception 'SQL92 privileges are wider than intended';
  end if;
end;
$$;

commit;
