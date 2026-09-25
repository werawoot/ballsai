-- Admin Audit Log v1
-- Append-only admin activity history plus atomic audited mutations for Ranking
-- and Hall of Fame. Apply only to Supabase project hivedzrwrrcnjrlirhtv.

begin;

create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated, service_role;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_label text not null check (char_length(actor_label) between 1 and 120),
  actor_role text not null default 'admin' check (actor_role = 'admin'),
  action text not null check (action ~ '^[a-z][a-z0-9_.]{2,79}$'),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{1,49}$'),
  target_id text check (target_id is null or char_length(target_id) between 1 and 160),
  summary text not null check (char_length(summary) between 1 and 240),
  before_data jsonb check (before_data is null or jsonb_typeof(before_data) = 'object'),
  after_data jsonb check (after_data is null or jsonb_typeof(after_data) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc, id desc);
create index if not exists admin_audit_logs_action_created_idx
  on public.admin_audit_logs (action, created_at desc, id desc);
create index if not exists admin_audit_logs_target_created_idx
  on public.admin_audit_logs (target_type, created_at desc, id desc);
create index if not exists admin_audit_logs_actor_created_idx
  on public.admin_audit_logs (actor_id, created_at desc, id desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin_audit_logs_admin_select" on public.admin_audit_logs;
create policy "admin_audit_logs_admin_select"
on public.admin_audit_logs for select to authenticated
using ((select public.is_admin()));

revoke all on table public.admin_audit_logs from public, anon, authenticated, service_role;
grant select on table public.admin_audit_logs to authenticated;

create or replace function audit.write_admin_event(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_summary text,
  p_before_data jsonb default null,
  p_after_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_label text;
  v_id uuid;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_action is null or p_action !~ '^[a-z][a-z0-9_.]{2,79}$'
    or p_target_type is null or p_target_type !~ '^[a-z][a-z0-9_]{1,49}$'
    or p_summary is null or char_length(btrim(p_summary)) not between 1 and 240
    or (p_target_id is not null and char_length(p_target_id) not between 1 and 160)
    or (p_before_data is not null and jsonb_typeof(p_before_data) <> 'object')
    or (p_after_data is not null and jsonb_typeof(p_after_data) <> 'object')
    or pg_column_size(coalesce(p_before_data, '{}'::jsonb)) > 16384
    or pg_column_size(coalesce(p_after_data, '{}'::jsonb)) > 16384 then
    raise exception 'INVALID_AUDIT_EVENT' using errcode = '22023';
  end if;

  select coalesce(nullif(ap.display_name, ''), nullif(p.full_name, ''), 'Admin ' || left(v_actor_id::text, 8))
  into v_actor_label
  from public.profiles p
  left join public.athlete_profiles ap on ap.user_id = p.id
  where p.id = v_actor_id;

  insert into public.admin_audit_logs (
    actor_id, actor_label, action, target_type, target_id, summary, before_data, after_data
  ) values (
    v_actor_id, coalesce(v_actor_label, 'Admin ' || left(v_actor_id::text, 8)),
    p_action, p_target_type, p_target_id, btrim(p_summary), p_before_data, p_after_data
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function audit.write_admin_event(text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- Used by server-side admin actions that already have their own guarded mutation.
create or replace function public.record_admin_audit_event(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_summary text,
  p_before_data jsonb default null,
  p_after_data jsonb default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select audit.write_admin_event(
    p_action, p_target_type, p_target_id, p_summary, p_before_data, p_after_data
  );
$$;

revoke all on function public.record_admin_audit_event(text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_admin_audit_event(text, text, text, text, jsonb, jsonb)
  to authenticated;

create or replace function public.admin_create_player_rank_with_audit(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.player_ranks%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_RANK_PAYLOAD' using errcode = '22023';
  end if;

  insert into public.player_ranks (
    player_id, player_name, team, province, position, ovr, pts,
    pac, sho, pas, dri, def, rank_change, sport, season
  ) values (
    nullif(p_payload->>'player_id', '')::uuid,
    left(btrim(p_payload->>'player_name'), 120), left(btrim(p_payload->>'team'), 120),
    left(btrim(p_payload->>'province'), 120), upper(left(btrim(p_payload->>'position'), 2)),
    (p_payload->>'ovr')::integer, (p_payload->>'pts')::integer,
    (p_payload->>'pac')::integer, (p_payload->>'sho')::integer,
    (p_payload->>'pas')::integer, (p_payload->>'dri')::integer,
    (p_payload->>'def')::integer, (p_payload->>'rank_change')::integer,
    left(btrim(p_payload->>'sport'), 40), left(btrim(p_payload->>'season'), 12)
  ) returning * into v_row;

  perform audit.write_admin_event(
    'ranking.create', 'player_rank', v_row.id::text,
    'สร้าง Ranking ให้นักกีฬา ' || v_row.player_name,
    null,
    jsonb_build_object(
      'player_id', v_row.player_id, 'player_name', v_row.player_name,
      'team', v_row.team, 'province', v_row.province, 'position', v_row.position,
      'ovr', v_row.ovr, 'pts', v_row.pts, 'sport', v_row.sport, 'season', v_row.season
    )
  );
  return v_row.id;
end;
$$;

create or replace function public.admin_update_player_rank_with_audit(p_rank_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.player_ranks%rowtype;
  v_after public.player_ranks%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_RANK_PAYLOAD' using errcode = '22023';
  end if;

  select * into v_before from public.player_ranks where id = p_rank_id for update;
  if not found then raise exception 'RANK_NOT_FOUND' using errcode = 'P0002'; end if;

  update public.player_ranks set
    player_id = nullif(p_payload->>'player_id', '')::uuid,
    player_name = left(btrim(p_payload->>'player_name'), 120),
    team = left(btrim(p_payload->>'team'), 120),
    province = left(btrim(p_payload->>'province'), 120),
    position = upper(left(btrim(p_payload->>'position'), 2)),
    ovr = (p_payload->>'ovr')::integer,
    pts = (p_payload->>'pts')::integer,
    pac = (p_payload->>'pac')::integer,
    sho = (p_payload->>'sho')::integer,
    pas = (p_payload->>'pas')::integer,
    dri = (p_payload->>'dri')::integer,
    def = (p_payload->>'def')::integer,
    rank_change = (p_payload->>'rank_change')::integer
  where id = p_rank_id returning * into v_after;

  perform audit.write_admin_event(
    'ranking.update', 'player_rank', p_rank_id::text,
    'แก้ไข Ranking ของนักกีฬา ' || v_after.player_name,
    jsonb_build_object('player_id', v_before.player_id, 'player_name', v_before.player_name, 'team', v_before.team, 'province', v_before.province, 'position', v_before.position, 'ovr', v_before.ovr, 'pts', v_before.pts, 'pac', v_before.pac, 'sho', v_before.sho, 'pas', v_before.pas, 'dri', v_before.dri, 'def', v_before.def, 'rank_change', v_before.rank_change),
    jsonb_build_object('player_id', v_after.player_id, 'player_name', v_after.player_name, 'team', v_after.team, 'province', v_after.province, 'position', v_after.position, 'ovr', v_after.ovr, 'pts', v_after.pts, 'pac', v_after.pac, 'sho', v_after.sho, 'pas', v_after.pas, 'dri', v_after.dri, 'def', v_after.def, 'rank_change', v_after.rank_change)
  );
end;
$$;

create or replace function public.admin_delete_player_rank_with_audit(p_rank_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.player_ranks%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select * into v_before from public.player_ranks where id = p_rank_id for update;
  if not found then raise exception 'RANK_NOT_FOUND' using errcode = 'P0002'; end if;

  delete from public.player_ranks where id = p_rank_id;
  perform audit.write_admin_event(
    'ranking.delete', 'player_rank', p_rank_id::text,
    'ลบ Ranking ของนักกีฬา ' || v_before.player_name,
    jsonb_build_object('player_id', v_before.player_id, 'player_name', v_before.player_name, 'team', v_before.team, 'province', v_before.province, 'position', v_before.position, 'ovr', v_before.ovr, 'pts', v_before.pts, 'sport', v_before.sport, 'season', v_before.season),
    null
  );
end;
$$;

create or replace function public.admin_award_hall_entry_with_audit(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.hall_of_fame_entries%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_HALL_PAYLOAD' using errcode = '22023';
  end if;

  insert into public.hall_of_fame_entries (
    season, category, age_group, province, athlete_id, player_rank_id,
    athlete_name, team_name, position, citation, created_by
  ) values (
    left(btrim(p_payload->>'season'), 12), p_payload->>'category', p_payload->>'age_group',
    nullif(left(btrim(p_payload->>'province'), 120), ''), nullif(p_payload->>'athlete_id', '')::uuid,
    (p_payload->>'player_rank_id')::uuid, left(btrim(p_payload->>'athlete_name'), 120),
    nullif(left(btrim(p_payload->>'team_name'), 120), ''), nullif(upper(left(btrim(p_payload->>'position'), 2)), ''),
    left(btrim(p_payload->>'citation'), 280), auth.uid()
  ) returning * into v_row;

  perform audit.write_admin_event(
    'hall_of_fame.award', 'hall_of_fame_entry', v_row.id::text,
    'ประกาศ Hall of Fame ให้ ' || v_row.athlete_name,
    null,
    jsonb_build_object('athlete_id', v_row.athlete_id, 'athlete_name', v_row.athlete_name, 'category', v_row.category, 'age_group', v_row.age_group, 'season', v_row.season, 'citation', v_row.citation)
  );
  return v_row.id;
end;
$$;

create or replace function public.admin_resolve_data_dispute_with_audit(
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
  v_before public.data_disputes%rowtype;
  v_after public.data_disputes%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select * into v_before from public.data_disputes where id = p_dispute_id;
  if not found then raise exception 'DISPUTE_NOT_FOUND' using errcode = 'P0002'; end if;

  perform public.resolve_data_dispute_safely(p_dispute_id, p_status, p_resolution);
  select * into v_after from public.data_disputes where id = p_dispute_id;
  perform audit.write_admin_event(
    'trust.dispute.resolve', 'data_dispute', p_dispute_id::text,
    'อัปเดตข้อโต้แย้งเป็น ' || p_status,
    jsonb_build_object('subject_type', v_before.subject_type, 'subject_id', v_before.subject_id, 'status', v_before.status),
    jsonb_build_object('subject_type', v_after.subject_type, 'subject_id', v_after.subject_id, 'status', v_after.status, 'resolution', left(v_after.resolution, 240))
  );
end;
$$;

revoke all on function public.admin_create_player_rank_with_audit(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_player_rank_with_audit(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_delete_player_rank_with_audit(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_award_hall_entry_with_audit(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_resolve_data_dispute_with_audit(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_player_rank_with_audit(jsonb) to authenticated;
grant execute on function public.admin_update_player_rank_with_audit(uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_player_rank_with_audit(uuid) to authenticated;
grant execute on function public.admin_award_hall_entry_with_audit(jsonb) to authenticated;
grant execute on function public.admin_resolve_data_dispute_with_audit(uuid, text, text) to authenticated;

-- Remove browser-table writes for the two surfaces now routed through audited RPCs.
drop policy if exists "player_ranks_admin_insert" on public.player_ranks;
drop policy if exists "player_ranks_admin_update" on public.player_ranks;
drop policy if exists "player_ranks_admin_delete" on public.player_ranks;
revoke insert, update, delete on table public.player_ranks from authenticated;

drop policy if exists "hall_of_fame_organizer_write" on public.hall_of_fame_entries;
revoke insert, update, delete on table public.hall_of_fame_entries from authenticated;

commit;
