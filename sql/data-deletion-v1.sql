-- BallDoenSai.com athlete data deletion V1 (PDPA)
-- Apply after sql/digital-identity-v2-hall.sql and sql/highlight-moderation-v1.sql.
-- Safe to re-run in the Supabase SQL editor.
--
-- Why this exists: the privacy policy promises a way out, but the app had no path to
-- erase an athlete's own data. RLS also blocks the athlete from touching the two places
-- their name survives: player_ranks (admin-only writes) and the tournament record.
--
-- What this function does and does not do, deliberately:
--   * deletes the athlete profile, which cascades videos, achievements, skill
--     assessments, highlight rows, XP events, badges and progress
--   * anonymises the athlete's ranking rows instead of deleting them, because
--     Power Rating history belongs to matches other teams also played. Their name and
--     account link are removed; the numbers other athletes were rated against stay
--   * clears the personal fields on `profiles` but keeps the row and its email, because
--     the account still owns teams and payment records an organizer must be able to
--     audit, and because removing the auth user needs the service role key, which this
--     application deliberately does not hold
--   * files a deletion request so an admin can finish removing the auth account
--
-- Deleting an auth user therefore stays a human step in the Supabase dashboard. The
-- request table is the queue for it.

begin;

create table if not exists public.account_deletion_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  unique (user_id)
);

create index if not exists account_deletion_requests_open_idx
  on public.account_deletion_requests (requested_at desc)
  where completed_at is null;

alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion_requests_owner_or_admin_select" on public.account_deletion_requests;
create policy "deletion_requests_owner_or_admin_select"
on public.account_deletion_requests for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "deletion_requests_admin_update" on public.account_deletion_requests;
create policy "deletion_requests_admin_update"
on public.account_deletion_requests for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.delete_my_athlete_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_ranks integer := 0;
  v_highlight_paths text[] := '{}';
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_user_id;

  -- Returned to the caller so the route can remove the objects the athlete owns in
  -- storage. SQL cannot delete storage objects.
  select coalesce(array_agg(media_path), '{}')
  into v_highlight_paths
  from public.athlete_highlights
  where athlete_id = v_user_id;

  update public.player_ranks
  set player_name = 'ATHLETE REMOVED',
      player_id = null
  where player_id = v_user_id;
  get diagnostics v_ranks = row_count;

  delete from public.athlete_profiles where user_id = v_user_id;

  update public.profiles
  set full_name = '',
      phone = null,
      province = null,
      team = null,
      position = null,
      onboarding_persona = null,
      onboarding_sport = null,
      onboarding_goal = null,
      updated_at = now()
  where id = v_user_id;

  insert into public.account_deletion_requests (user_id, email)
  values (v_user_id, v_email)
  on conflict (user_id) do update set requested_at = now(), completed_at = null, completed_by = null;

  return jsonb_build_object('anonymisedRankings', v_ranks, 'highlightPaths', v_highlight_paths);
end;
$$;

revoke all on function public.delete_my_athlete_data() from public;
grant execute on function public.delete_my_athlete_data() to authenticated;

commit;
