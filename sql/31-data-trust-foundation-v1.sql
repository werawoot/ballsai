-- BallDoenSai.com Data Trust Foundation V1
-- Prepare only. Apply after review and RLS tests with real JWTs.
-- No secrets, storage URLs, or production data are included here.

begin;

create table if not exists public.data_provenance (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('athlete_profile', 'player_rank', 'rating_event', 'match_result', 'performance')),
  subject_id uuid not null,
  source_type text not null check (source_type in ('self', 'coach_verified', 'performance_verified', 'organizer_verified', 'admin_verified', 'imported')),
  source_actor_id uuid references auth.users(id) on delete set null,
  verification_level text not null check (verification_level in ('self', 'coach_verified', 'performance_verified')),
  confidence numeric(5,4) not null default 0.5000 check (confidence >= 0 and confidence <= 1),
  verification_method text not null check (char_length(trim(verification_method)) between 3 and 80),
  metadata jsonb not null default '{}'::jsonb,
  supersedes_id uuid references public.data_provenance(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists data_provenance_subject_idx
  on public.data_provenance(subject_type, subject_id, created_at desc);

create table if not exists public.verification_evidence (
  id uuid primary key default gen_random_uuid(),
  provenance_id uuid not null references public.data_provenance(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('match_sheet', 'organizer_confirmation', 'coach_attestation', 'identity_document', 'video', 'photo', 'external_record', 'other')),
  storage_path text,
  content_hash text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (storage_path is null or char_length(trim(storage_path)) between 1 and 500),
  check (content_hash is null or char_length(trim(content_hash)) between 16 and 256)
);

create index if not exists verification_evidence_provenance_idx
  on public.verification_evidence(provenance_id, review_status, created_at desc);

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  event_type text not null check (event_type in ('submitted', 'reviewed', 'accepted', 'rejected', 'superseded', 'disputed', 'resolved')),
  from_level text check (from_level is null or from_level in ('self', 'coach_verified', 'performance_verified')),
  to_level text check (to_level is null or to_level in ('self', 'coach_verified', 'performance_verified')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  provenance_id uuid references public.data_provenance(id) on delete set null,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists verification_events_subject_idx
  on public.verification_events(subject_type, subject_id, created_at desc);

create table if not exists public.data_disputes (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  opened_by uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in ('identity', 'match_result', 'rating', 'statistics', 'ranking', 'privacy', 'other')),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'upheld', 'rejected', 'withdrawn')),
  resolution text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_disputes_queue_idx
  on public.data_disputes(status, created_at desc);
create index if not exists data_disputes_opened_by_idx
  on public.data_disputes(opened_by, created_at desc);

create table if not exists public.data_anomaly_flags (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  rule_code text not null check (char_length(trim(rule_code)) between 3 and 80),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'false_positive')),
  score numeric(6,4) check (score is null or (score >= 0 and score <= 1)),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists data_anomaly_flags_queue_idx
  on public.data_anomaly_flags(status, severity, detected_at desc);

create table if not exists public.rank_explanations (
  id uuid primary key default gen_random_uuid(),
  player_rating_id uuid not null references public.player_ratings(id) on delete cascade,
  player_id uuid references auth.users(id) on delete set null,
  sport text not null,
  season text not null,
  rating_snapshot integer not null check (rating_snapshot between 0 and 3000),
  confidence text not null check (confidence in ('provisional', 'active', 'full')),
  verification_level text not null check (verification_level in ('self', 'coach_verified', 'performance_verified')),
  inputs jsonb not null default '{}'::jsonb,
  explanation text not null check (char_length(trim(explanation)) between 20 and 2000),
  generated_at timestamptz not null default now(),
  unique(player_rating_id, generated_at)
);

create index if not exists rank_explanations_player_idx
  on public.rank_explanations(player_id, sport, season, generated_at desc);

-- Public reads are limited to safe summaries. Evidence, disputes and anomaly details
-- remain private to the owner/reviewer/admin. Writes go through reviewed RPCs later.
alter table public.data_provenance enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.verification_events enable row level security;
alter table public.data_disputes enable row level security;
alter table public.data_anomaly_flags enable row level security;
alter table public.rank_explanations enable row level security;

-- A verification event can concern an athlete even when an organizer or admin was
-- the actor. Resolve ownership by subject type instead of exposing all event rows.
create or replace function public.can_view_verification_event_subject(
  p_subject_type text,
  p_subject_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return false; end if;
  if public.is_admin() then return true; end if;

  return
    (p_subject_type = 'athlete_profile' and p_subject_id = v_user_id)
    or (p_subject_type = 'player_rank' and exists (
      select 1 from public.player_ranks pr
      where pr.id = p_subject_id and pr.player_id = v_user_id
    ))
    or (p_subject_type = 'rating_event' and exists (
      select 1 from public.rating_events re
      join public.player_ratings pr on pr.id = re.player_rating_id
      where re.id = p_subject_id and pr.player_id = v_user_id
    ))
    or (p_subject_type = 'match_result' and exists (
      select 1 from public.match_player_performances mp
      join public.player_ranks pr on pr.id = mp.player_rank_id
      where mp.match_result_id = p_subject_id and pr.player_id = v_user_id
    ))
    or (p_subject_type = 'performance' and exists (
      select 1 from public.match_player_performances mp
      join public.player_ranks pr on pr.id = mp.player_rank_id
      where mp.id = p_subject_id and pr.player_id = v_user_id
    ));
end;
$$;

drop policy if exists data_provenance_public_accepted on public.data_provenance;
create policy data_provenance_public_accepted
on public.data_provenance for select to anon, authenticated
using (verification_level in ('coach_verified', 'performance_verified') and verified_at is not null);

drop policy if exists verification_evidence_owner_or_admin on public.verification_evidence;
create policy verification_evidence_owner_or_admin
on public.verification_evidence for select to authenticated
using (submitted_by = (select auth.uid()) or public.is_admin());

drop policy if exists verification_events_subject_or_admin on public.verification_events;
create policy verification_events_subject_or_admin
on public.verification_events for select to authenticated
using (
  actor_id = (select auth.uid())
  or public.can_view_verification_event_subject(subject_type, subject_id)
);

drop policy if exists data_disputes_owner_or_admin on public.data_disputes;
create policy data_disputes_owner_or_admin
on public.data_disputes for select to authenticated
using (opened_by = (select auth.uid()) or public.is_admin());

drop policy if exists data_disputes_owner_insert on public.data_disputes;

drop policy if exists data_anomaly_admin_only on public.data_anomaly_flags;
create policy data_anomaly_admin_only
on public.data_anomaly_flags for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists rank_explanations_public_safe on public.rank_explanations;
create policy rank_explanations_public_safe
on public.rank_explanations for select to anon, authenticated
using (
  exists (
    select 1 from public.athlete_profiles ap
    where ap.user_id = rank_explanations.player_id
      and ap.is_public = true
  )
);

revoke all on public.data_provenance, public.verification_evidence, public.verification_events,
  public.data_disputes, public.data_anomaly_flags, public.rank_explanations from anon, authenticated;
grant select on public.data_provenance, public.rank_explanations to anon, authenticated;
grant select on public.verification_evidence, public.verification_events, public.data_disputes,
  public.data_anomaly_flags to authenticated;

-- Append-only guard: corrections are new events, never UPDATE/DELETE history.
create or replace function public.prevent_data_trust_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'DATA_TRUST_HISTORY_APPEND_ONLY' using errcode = '42501';
end;
$$;

drop trigger if exists verification_events_append_only on public.verification_events;
create trigger verification_events_append_only
before update or delete on public.verification_events
for each row execute function public.prevent_data_trust_history_mutation();

-- Disputes are submitted only through this RPC. The database verifies that an
-- athlete can dispute only their own profile, card, rating event or performance.
create or replace function public.open_data_dispute_safely(
  p_subject_type text,
  p_subject_id uuid,
  p_category text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_dispute_id uuid;
  v_allowed boolean := false;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_subject_type not in ('athlete_profile', 'player_rank', 'rating_event', 'match_result', 'performance') then raise exception 'INVALID_SUBJECT_TYPE' using errcode = '22023'; end if;
  if p_category not in ('identity', 'match_result', 'rating', 'statistics', 'ranking', 'privacy', 'other') then raise exception 'INVALID_DISPUTE_CATEGORY' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_description, ''))) not between 10 and 2000 then raise exception 'INVALID_DISPUTE_DESCRIPTION' using errcode = '22023'; end if;

  v_allowed := public.is_admin()
    or (p_subject_type = 'athlete_profile' and p_subject_id = v_user_id)
    or (p_subject_type = 'player_rank' and exists (select 1 from public.player_ranks pr where pr.id = p_subject_id and pr.player_id = v_user_id))
    or (p_subject_type = 'rating_event' and exists (select 1 from public.rating_events re join public.player_ratings pr on pr.id = re.player_rating_id where re.id = p_subject_id and pr.player_id = v_user_id))
    or (p_subject_type = 'match_result' and exists (select 1 from public.match_player_performances mp join public.player_ranks pr on pr.id = mp.player_rank_id where mp.match_result_id = p_subject_id and pr.player_id = v_user_id))
    or (p_subject_type = 'performance' and exists (select 1 from public.match_player_performances mp join public.player_ranks pr on pr.id = mp.player_rank_id where mp.id = p_subject_id and pr.player_id = v_user_id));
  if not v_allowed then raise exception 'DISPUTE_SUBJECT_FORBIDDEN' using errcode = '42501'; end if;

  insert into public.data_disputes(subject_type, subject_id, opened_by, category, description)
  values(p_subject_type, p_subject_id, v_user_id, p_category, trim(p_description))
  returning id into v_dispute_id;
  insert into public.verification_events(subject_type, subject_id, event_type, actor_id, actor_role, reason)
  select p_subject_type, p_subject_id, 'disputed', v_user_id, coalesce(role, 'athlete'), 'Dispute opened: ' || p_category
  from public.profiles where id = v_user_id;
  return v_dispute_id;
end;
$$;

create or replace function public.resolve_data_dispute_safely(
  p_dispute_id uuid,
  p_status text,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_dispute public.data_disputes%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_status not in ('in_review', 'upheld', 'rejected') then raise exception 'INVALID_DISPUTE_STATUS' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_resolution, ''))) not between 3 and 2000 then raise exception 'INVALID_RESOLUTION' using errcode = '22023'; end if;
  select * into v_dispute from public.data_disputes where id = p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_dispute.status in ('upheld', 'rejected', 'withdrawn') then raise exception 'DISPUTE_ALREADY_CLOSED' using errcode = '22023'; end if;

  update public.data_disputes set status = p_status, resolution = trim(p_resolution),
    resolved_by = case when p_status in ('upheld', 'rejected') then v_user_id else null end,
    resolved_at = case when p_status in ('upheld', 'rejected') then now() else null end,
    updated_at = now()
  where id = p_dispute_id;
  insert into public.verification_events(subject_type, subject_id, event_type, actor_id, actor_role, reason)
  values(v_dispute.subject_type, v_dispute.subject_id, 'resolved', v_user_id, 'admin', trim(p_resolution));
end;
$$;

revoke all on function public.open_data_dispute_safely(text, uuid, text, text) from public;
grant execute on function public.open_data_dispute_safely(text, uuid, text, text) to authenticated;
revoke all on function public.resolve_data_dispute_safely(uuid, text, text) from public;
grant execute on function public.resolve_data_dispute_safely(uuid, text, text) to authenticated;
revoke all on function public.can_view_verification_event_subject(text, uuid) from public, anon;
grant execute on function public.can_view_verification_event_subject(text, uuid) to authenticated;

commit;
