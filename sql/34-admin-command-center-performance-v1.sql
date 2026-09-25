-- BallDoenSai.com Admin Command Center Performance V1
-- Prepare only. Apply to project hivedzrwrrcnjrlirhtv after explicit approval.
-- Depends on SQL 15, 16, 17, 21, 23, 26, 27, 33 and the core closed-beta schema.

begin;

-- Fail before changing anything if production is missing a dependency that PL/pgSQL
-- would otherwise discover only when the summary RPC is first called.
do $$
declare
  v_missing text;
begin
  select string_agg(required.table_name, ', ' order by required.table_name)
  into v_missing
  from (
    values
      ('account_deletion_requests'),
      ('athlete_highlight_reports'),
      ('athlete_profiles'),
      ('guardian_links'),
      ('match_results'),
      ('organization_members'),
      ('organizations'),
      ('payments'),
      ('profiles'),
      ('sponsorship_interests'),
      ('teams'),
      ('tournaments'),
      ('venue_booking_requests'),
      ('venue_profiles')
  ) as required(table_name)
  where to_regclass('public.' || required.table_name) is null;

  if v_missing is not null then
    raise exception 'SQL34 missing required public tables: %', v_missing;
  end if;

  if to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL34 missing required function: public.is_admin()';
  end if;
end;
$$;

-- Name search is intentionally server-side and returns only a small result set.
-- Trigram keeps Thai contains-search usable after athlete_profiles grows large.
create extension if not exists pg_trgm with schema extensions;
create index if not exists athlete_profiles_display_name_trgm_idx
  on public.athlete_profiles using gin (display_name extensions.gin_trgm_ops);

-- The Command Center repeatedly filters these small, open subsets. Partial indexes
-- keep queue reads compact without slowing every historical-row query.
create index if not exists teams_admin_pending_queue_idx
  on public.teams (created_at desc) where status = 'pending';
create index if not exists payments_admin_unconfirmed_queue_idx
  on public.payments (created_at desc) where status <> 'confirmed';
create index if not exists guardian_links_admin_pending_queue_idx
  on public.guardian_links (requested_at desc) where status = 'pending';
create index if not exists venue_bookings_admin_pending_queue_idx
  on public.venue_booking_requests (requested_at desc) where status = 'pending';
create index if not exists organization_members_admin_pending_queue_idx
  on public.organization_members (invited_at desc) where status = 'pending';
create index if not exists sponsorship_interests_admin_submitted_queue_idx
  on public.sponsorship_interests (created_at desc) where status = 'submitted';
create index if not exists profiles_role_admin_summary_idx
  on public.profiles (role) where role in ('admin', 'organizer');

-- Large historical totals are estimates from PostgreSQL statistics. Open queues stay
-- exact because operators act on those numbers. This avoids full-table COUNT scans
-- every time an admin opens the page.
create or replace function public.get_admin_command_center_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not (select public.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'estimated', true,
    'profiles', greatest(coalesce((select reltuples::bigint from pg_catalog.pg_class where oid = 'public.profiles'::regclass), 0), 0),
    'managers', (select count(*) from public.profiles where role in ('admin', 'organizer')),
    'tournaments', greatest(coalesce((select reltuples::bigint from pg_catalog.pg_class where oid = 'public.tournaments'::regclass), 0), 0),
    'results', greatest(coalesce((select reltuples::bigint from pg_catalog.pg_class where oid = 'public.match_results'::regclass), 0), 0),
    'venues', greatest(coalesce((select reltuples::bigint from pg_catalog.pg_class where oid = 'public.venue_profiles'::regclass), 0), 0),
    'organizations', greatest(coalesce((select reltuples::bigint from pg_catalog.pg_class where oid = 'public.organizations'::regclass), 0), 0),
    'pending_teams', (select count(*) from public.teams where status = 'pending'),
    'pending_payments', (select count(*) from public.payments where status <> 'confirmed'),
    'open_highlight_reports', (select count(*) from public.athlete_highlight_reports where resolved_at is null),
    'open_deletion_requests', (select count(*) from public.account_deletion_requests where completed_at is null),
    'pending_guardian_links', (select count(*) from public.guardian_links where status = 'pending'),
    'pending_venue_bookings', (select count(*) from public.venue_booking_requests where status = 'pending'),
    'pending_organization_invites', (select count(*) from public.organization_members where status = 'pending'),
    'submitted_sponsor_interests', (select count(*) from public.sponsorship_interests where status = 'submitted'),
    'generated_at', now()
  ) into v_summary;

  return v_summary;
end;
$$;

-- Supabase can add explicit default EXECUTE grants to new functions, so revoke each
-- non-user API role rather than relying on PUBLIC alone.
revoke all on function public.get_admin_command_center_summary() from public, anon, service_role;
grant execute on function public.get_admin_command_center_summary() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.get_admin_command_center_summary()', 'execute') then
    raise exception 'SQL34 privilege check failed: anon can execute admin summary';
  end if;
  if has_function_privilege('service_role', 'public.get_admin_command_center_summary()', 'execute') then
    raise exception 'SQL34 privilege check failed: service_role can execute admin summary';
  end if;
  if not has_function_privilege('authenticated', 'public.get_admin_command_center_summary()', 'execute') then
    raise exception 'SQL34 privilege check failed: authenticated cannot execute admin summary';
  end if;
end;
$$;

commit;
