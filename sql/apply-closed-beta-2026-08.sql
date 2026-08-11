-- BallDoenSai.com · ชุด migration รวมสำหรับรอบ Closed Beta (สิงหาคม 2026)
--
-- ไฟล์นี้ไม่ใช่ migration ใหม่ เป็นเพียงการรวมไฟล์ที่ 13-16 ของ docs/closed-beta-runbook.md §3
-- ไว้ใน transaction เดียว เพื่อให้ paste ลง Supabase SQL Editor ครั้งเดียวจบ
-- ต้นฉบับที่เป็นบันทึกของ schema ยังคงเป็นไฟล์แยกทั้งสี่ไฟล์
--
-- วิธีใช้
--   1. เปิด Supabase SQL Editor ของ project ref hivedzrwrrcnjrlirhtv เท่านั้น
--      ยืนยันจาก URL ก่อนวาง
--   2. ต้อง apply ไฟล์ที่ 1-12 ใน runbook §3 ครบก่อน
--   3. วางไฟล์นี้ทั้งไฟล์แล้วกด Run ครั้งเดียว
--   4. รันคำสั่งตรวจท้ายไฟล์ (อยู่นอก transaction) ต้องได้ trigger 5 ตัว และ function 5 ตัว
--
-- ทั้งหมดอยู่ใน transaction เดียว ถ้าขั้นไหนพลาด จะไม่มีอะไรถูกเปลี่ยนเลย
-- และรันซ้ำได้ปลอดภัยทุกขั้น
--
-- สิ่งที่จะเปลี่ยนข้อมูลจริง ไม่ใช่แค่ schema
--   * โปรไฟล์ที่เผยแพร่อยู่โดยไม่มีวันเกิด หรือเป็นผู้เยาว์ที่ไม่มีความยินยอมผู้ปกครอง
--     จะถูกปิดการเผยแพร่ (is_public = false) ไม่มีการลบข้อมูล

begin;

-- ═══════════════════════════════════════════════════════════
-- sql/match-result-void-v1.sql
-- ยกเลิกผลแข่ง + คืน Rating/XP/Badge
-- ═══════════════════════════════════════════════════════════
-- BallDoenSai.com match result void V1
-- Apply after sql/production-hardening.sql and sql/digital-identity-v2-hall.sql.
-- Safe to re-run in the Supabase SQL editor.
--
-- Why this exists: a confirmed result writes match_results,
-- match_player_performances, player_ratings, player_ranks, rating_events and (via
-- trigger) XP and badges in one transaction. Until now nothing could undo it, so a
-- mistyped score left a permanent wrong rating and a badge that could not be taken
-- back. This function reverses one result using the rating_before value recorded on
-- each rating_event, which is exact rather than recomputed.
--
-- Deliberate limits:
-- * A result can be voided only while it is still the newest result for every
--   athlete in it (LIFO). Otherwise reverting to rating_before would discard a later
--   match. Void the newer result first.
-- * match_results and match_player_performances are kept and marked 'void' so the
--   audit trail survives. Only rating_events are deleted, because XP rows cascade
--   from them.
create index if not exists rating_events_match_id_idx
  on public.rating_events (match_id)
  where match_id is not null;

create or replace function public.void_match_result_safely(p_match_result_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_match public.match_results%rowtype;
  v_organizer_id uuid;
  v_event public.rating_events%rowtype;
  v_rating public.player_ratings%rowtype;
  v_latest_event_id uuid;
  v_reverted integer := 0;
  v_athletes uuid[] := '{}';
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_match from public.match_results where id = p_match_result_id for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_match.status = 'void' then
    raise exception 'ALREADY_VOID' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  select organizer_id into v_organizer_id
  from public.tournaments
  where id = v_match.tournament_id;

  if v_role not in ('organizer', 'admin') or (v_role <> 'admin' and v_organizer_id <> v_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_event in
    select * from public.rating_events
    where match_id = p_match_result_id
    order by created_at
  loop
    select * into v_rating
    from public.player_ratings
    where id = v_event.player_rating_id
    for update;
    if not found then
      continue;
    end if;

    -- Reverting is only safe while this is the athlete's most recent event.
    select id into v_latest_event_id
    from public.rating_events
    where player_rating_id = v_event.player_rating_id
    order by created_at desc, id desc
    limit 1;

    if v_latest_event_id is distinct from v_event.id then
      raise exception 'NEWER_RESULT_EXISTS' using errcode = '40001';
    end if;

    update public.player_ratings set
      power_rating = v_event.rating_before,
      matches_played = greatest(0, v_rating.matches_played - 1),
      wins = greatest(0, v_rating.wins - case when v_event.result = 'win' then 1 else 0 end),
      draws = greatest(0, v_rating.draws - case when v_event.result = 'draw' then 1 else 0 end),
      losses = greatest(0, v_rating.losses - case when v_event.result = 'loss' then 1 else 0 end),
      goals = greatest(0, v_rating.goals - v_event.goals),
      assists = greatest(0, v_rating.assists - v_event.assists),
      clean_sheets = greatest(0, v_rating.clean_sheets - case when v_event.clean_sheet then 1 else 0 end),
      mvps = greatest(0, v_rating.mvps - case when v_event.mvp then 1 else 0 end),
      last_rating_change = 0,
      updated_at = now()
    where id = v_rating.id;

    if v_rating.player_rank_id is not null then
      update public.player_ranks set
        pts = v_event.rating_before,
        ovr = greatest(40, least(99, round(40 + (v_event.rating_before::numeric / 3000) * 59)::integer)),
        rank_change = 0
      where id = v_rating.player_rank_id;
    end if;

    if v_rating.player_id is not null then
      v_athletes := array_append(v_athletes, v_rating.player_id);
    end if;
    v_reverted := v_reverted + 1;
  end loop;

  -- Deleting the events cascades athlete_xp_events and clears
  -- athlete_badges.source_rating_event_id.
  delete from public.rating_events where match_id = p_match_result_id;

  update public.athlete_progress progress
  set xp_total = coalesce(totals.xp_total, 0),
      current_level = least(99, 1 + floor(sqrt(coalesce(totals.xp_total, 0) / 100.0))::smallint),
      updated_at = now()
  from (
    select athletes.athlete_id,
           (select sum(xp_amount)::integer from public.athlete_xp_events events
             where events.athlete_id = athletes.athlete_id) as xp_total
    from (select distinct unnest(v_athletes) as athlete_id) athletes
  ) totals
  where progress.athlete_id = totals.athlete_id;

  -- A badge earned from a voided match must go back too, otherwise the passport
  -- would keep an achievement that no verified result supports. The 'rookie' badge
  -- comes from creating a profile, never from a match, so it is left alone.
  delete from public.athlete_badges badges
  using (
    select ratings.player_id as athlete_id,
           sum(ratings.matches_played) as matches_played,
           sum(ratings.wins) as wins,
           sum(ratings.goals) as goals,
           sum(ratings.assists) as assists,
           sum(ratings.clean_sheets) as clean_sheets,
           sum(ratings.mvps) as mvps,
           max(ratings.power_rating) as power_rating
    from public.player_ratings ratings
    where ratings.player_id = any(v_athletes)
    group by ratings.player_id
  ) totals
  where badges.athlete_id = totals.athlete_id
    and badges.badge_key <> 'rookie'
    and (
      (badges.badge_key = 'first_match' and totals.matches_played < 1)
      or (badges.badge_key = 'first_win' and totals.wins < 1)
      or (badges.badge_key = 'goal_hunter' and totals.goals < 1)
      or (badges.badge_key = 'playmaker' and totals.assists < 1)
      or (badges.badge_key = 'clean_sheet' and totals.clean_sheets < 1)
      or (badges.badge_key = 'match_mvp' and totals.mvps < 1)
      or (badges.badge_key = 'road_warrior' and totals.matches_played < 10)
      or (badges.badge_key = 'rising_star' and totals.power_rating < 1500)
    );

  delete from public.athlete_achievements achievements
  where achievements.athlete_id = any(v_athletes)
    and achievements.identity_badge_key is not null
    and not exists (
      select 1 from public.athlete_badges badges
      where badges.athlete_id = achievements.athlete_id
        and badges.badge_key = achievements.identity_badge_key
    );

  update public.match_results
  set status = 'void', updated_at = now()
  where id = p_match_result_id;

  return v_reverted;
end;
$$;

revoke all on function public.void_match_result_safely(uuid) from public;
grant execute on function public.void_match_result_safely(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- sql/guardian-consent-enforcement-v1.sql
-- บังคับความยินยอมผู้ปกครองระดับฐานข้อมูล
-- ═══════════════════════════════════════════════════════════
-- BallDoenSai.com guardian consent enforcement V1
-- Apply after sql/athlete-profile-v2.sql. Safe to re-run in the Supabase SQL editor.
--
-- Why this exists: app/profile/EditProfileForm.tsx already refuses to publish a minor's
-- profile without guardian consent, but that check lives in the browser. A direct API
-- call with a valid session could still set is_public = true, and the RLS policy only
-- asks who owns the row, not whether publishing is allowed. The users of this platform
-- are children, so the rule belongs in the database too.
--
-- The rule mirrors the form exactly:
--   * a public athlete profile must have a birth date
--   * anyone under 20 must also have guardian_consent_at recorded
create or replace function public.enforce_guardian_consent_for_public_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_public then
    if new.birth_date is null then
      raise exception 'PUBLIC_REQUIRES_BIRTH_DATE' using errcode = '22023';
    end if;
    if date_part('year', age(current_date, new.birth_date)) < 20
       and new.guardian_consent_at is null then
      raise exception 'PUBLIC_REQUIRES_GUARDIAN_CONSENT' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_profiles_guardian_consent_guard on public.athlete_profiles;
create trigger athlete_profiles_guardian_consent_guard
before insert or update on public.athlete_profiles
for each row execute function public.enforce_guardian_consent_for_public_profile();

-- Any row already published under the old client-only rule is unpublished rather than
-- left visible. Nothing is deleted: the athlete can publish again once the guardian
-- consent is recorded, which is the same path a new profile takes.
update public.athlete_profiles
set is_public = false, updated_at = now()
where is_public
  and (
    birth_date is null
    or (date_part('year', age(current_date, birth_date)) < 20 and guardian_consent_at is null)
  );

-- ═══════════════════════════════════════════════════════════
-- sql/highlight-moderation-v1.sql
-- คิวรายงานเนื้อหา + ซ่อน/แสดง Highlight
-- ═══════════════════════════════════════════════════════════
-- BallDoenSai.com highlight moderation V1
-- Apply after sql/athlete-highlight-uploads-v1.sql. Safe to re-run.
--
-- Why this exists: athletes upload images and video up to 25 MB and share their public
-- profile, but there was no report path, no review queue, and no way for an admin to take
-- a clip down other than deleting the storage object by hand. The users are children, so
-- a takedown must be immediate, reversible, and must not destroy the athlete's file.
--
-- Hiding is the default action: moderation_status flips to 'hidden' and the clip stops
-- being readable by anyone except its owner and an admin. Deleting stays available for
-- content that must not remain stored at all.
alter table public.athlete_highlights
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'hidden')),
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users(id) on delete set null;

create table if not exists public.athlete_highlight_reports (
  id bigint generated always as identity primary key,
  highlight_id bigint not null references public.athlete_highlights(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 400),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  -- One report per person per clip. Repeat reports add no information and would let a
  -- single account bury a clip in the queue.
  unique (highlight_id, reporter_id)
);

create index if not exists athlete_highlight_reports_open_idx
  on public.athlete_highlight_reports (created_at desc)
  where resolved_at is null;
create index if not exists athlete_highlight_reports_highlight_idx
  on public.athlete_highlight_reports (highlight_id);
create index if not exists athlete_highlights_hidden_idx
  on public.athlete_highlights (moderation_status, created_at desc);

alter table public.athlete_highlight_reports enable row level security;

drop policy if exists "highlight_reports_reporter_insert" on public.athlete_highlight_reports;
create policy "highlight_reports_reporter_insert"
on public.athlete_highlight_reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists "highlight_reports_reporter_or_admin_select" on public.athlete_highlight_reports;
create policy "highlight_reports_reporter_or_admin_select"
on public.athlete_highlight_reports for select to authenticated
using (reporter_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "highlight_reports_admin_update" on public.athlete_highlight_reports;
create policy "highlight_reports_admin_update"
on public.athlete_highlight_reports for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "highlight_reports_admin_delete" on public.athlete_highlight_reports;
create policy "highlight_reports_admin_delete"
on public.athlete_highlight_reports for delete to authenticated
using ((select public.is_admin()));

-- A hidden clip disappears for everyone but its owner and an admin. Replaces the policy
-- from sql/athlete-highlight-uploads-v1.sql, which only checked profile visibility.
drop policy if exists "athlete_highlights_public_or_owner_select" on public.athlete_highlights;
create policy "athlete_highlights_public_or_owner_select"
on public.athlete_highlights for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or (
    moderation_status = 'visible'
    and exists (
      select 1 from public.athlete_profiles p
      where p.user_id = athlete_highlights.athlete_id and p.is_public
    )
  )
);

-- The storage object must follow the row, otherwise a hidden clip would still be
-- readable by anyone who already knows its object path.
drop policy if exists "athlete_highlights_owner_or_public_profile_read" on storage.objects;
create policy "athlete_highlights_owner_or_public_profile_read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'athlete-highlights'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or exists (
      select 1
      from public.athlete_highlights h
      join public.athlete_profiles p on p.user_id = h.athlete_id
      where h.media_path = storage.objects.name
        and h.moderation_status = 'visible'
        and p.is_public
    )
  )
);

-- ═══════════════════════════════════════════════════════════
-- sql/data-deletion-v1.sql
-- สิทธิ์ลบข้อมูลตาม PDPA + คิวคำขอปิดบัญชี
-- ═══════════════════════════════════════════════════════════
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

-- ── คำสั่งตรวจ (รันแยกหลัง commit) ──────────────────────────
-- ต้องได้ trigger ครบ 5 ตัว
select tgname from pg_trigger
where tgname in (
  'on_auth_user_created',
  'rating_event_sync_athlete_identity',
  'athlete_badge_sync_achievement',
  'athlete_profile_create_rookie_identity',
  'athlete_profiles_guardian_consent_guard'
)
order by tgname;

-- ต้องได้ function ครบ 5 ตัว
select proname from pg_proc
where proname in (
  'register_team_safely',
  'confirm_payment_safely',
  'record_match_result_safely',
  'void_match_result_safely',
  'delete_my_athlete_data'
)
order by proname;

-- ต้องได้ตารางใหม่ 2 ตาราง และคอลัมน์ moderation_status
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('athlete_highlight_reports', 'account_deletion_requests')
order by table_name;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'athlete_highlights'
  and column_name in ('moderation_status', 'hidden_at', 'hidden_by')
order by column_name;
