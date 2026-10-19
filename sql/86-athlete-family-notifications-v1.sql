-- 86-athlete-family-notifications-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/17 (notifications, create_notification and its three
-- triggers), sql/21 (guardian_links), sql/72 (the current notification_type list),
-- ballsai-rating-v1 (match_results, match_player_performances), link-player-ranks-to-profiles
-- (player_ranks.player_id), digital-identity-v1 (athlete_badges), digital-identity-v2-hall
-- (hall_of_fame_entries). Precheck: sql/86-athlete-family-notifications-precheck.sql.
-- Postcheck: sql/86-athlete-family-notifications-postcheck.sql. Rollback:
-- sql/86-athlete-family-notifications-down.sql.
--
-- Why (owner, 19 Oct 2026, "ใช่ทั้งหมด ตามที่แนะนำ"): an audit of in-app notifications found
-- that a verified match result notified only the coaches who own the teams (sql/17), never
-- the athletes who played; guardians were told nothing about their child; a Hall of Fame
-- entry made no notification; and some texts showed machine words ("first goal",
-- "confirmed").
-- What:
--   * Each athlete in a verified match result is told the score, their result and their
--     Power Rating (คะแนนฝีมือ) before and after, with goals, assists, clean sheet and MVP when they count.
--     Every accepted guardian of that athlete is told the same, under the child's name.
--     The guardian is told about every match (owner's choice).
--   * A voided result tells the same athletes, their guardians and the team owners that
--     it was taken back, so a Rating going back is never a surprise.
--   * A new badge names the badge in Thai; accepted guardians are told too.
--   * A Hall of Fame entry (หอเกียรติยศ) tells the athlete and accepted guardians (new type
--     'hall_of_fame').
--   * A team status change says the status in Thai and opens that team's page.
-- Scale: one row per person per event, keyed by source_key, so a retried or repeated event
-- never notifies twice. No broadcast: recipients are the athlete (player_ranks primary
-- key), their guardians (guardian_links_athlete_status_idx) and two team owners.
-- A void reads that match's performances through match_player_performances_match_idx.
-- Triggers run inside the writing transaction, as sql/17 and sql/41 do: a failed
-- notification fails the write instead of losing the news silently.

begin;

do $$
begin
  if to_regclass('public.notifications') is null or to_regclass('public.guardian_links') is null
     or to_regclass('public.match_results') is null or to_regclass('public.match_player_performances') is null
     or to_regclass('public.player_ranks') is null or to_regclass('public.athlete_badges') is null
     or to_regclass('public.hall_of_fame_entries') is null or to_regclass('public.athlete_profiles') is null
     or to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ranks' and column_name = 'player_id') then
    raise exception 'Prerequisites missing: sql/17, sql/21, rating, player_ranks.player_id, badges, hall';
  end if;
end;
$$;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder', 'team_training_plan', 'hall_of_fame'
  ));

-- The athlete gets the athlete's words and link; each accepted guardian gets the child's
-- name in front and the family page. Keys end in the recipient, so each is told once.
create or replace function public.notify_athlete_family(
  p_athlete uuid, p_type text, p_title text, p_body text, p_href text, p_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_guardian uuid;
begin
  if p_athlete is null then return; end if;
  perform public.create_notification(p_athlete, p_type, left(p_title, 160), left(coalesce(p_body, ''), 500), p_href,
    p_key || ':' || p_athlete::text);
  select coalesce(nullif(btrim(a.display_name), ''), 'ลูกของคุณ') into v_name
  from public.athlete_profiles a where a.user_id = p_athlete;
  for v_guardian in
    select g.guardian_id from public.guardian_links g
    where g.athlete_id = p_athlete and g.status = 'accepted' and g.guardian_id <> p_athlete
  loop
    perform public.create_notification(v_guardian, p_type, left(coalesce(v_name, 'ลูกของคุณ') || ': ' || p_title, 160),
      left(coalesce(p_body, ''), 500), '/guardian', p_key || ':' || p_athlete::text || ':' || v_guardian::text);
  end loop;
end;
$$;
revoke all on function public.notify_athlete_family(uuid, text, text, text, text, text) from public, anon, authenticated;

-- "ทีม A 3–1 ทีม B", the same words for every recipient of one match.
create or replace function public.match_score_line(p_match_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ta.name, 'ทีม') || ' ' || m.team_a_score || '–' || m.team_b_score || ' ' || coalesce(tb.name, 'ทีม')
  from public.match_results m
  left join public.teams ta on ta.id = m.team_a_id
  left join public.teams tb on tb.id = m.team_b_id
  where m.id = p_match_id;
$$;
revoke all on function public.match_score_line(uuid) from public, anon, authenticated;

create or replace function public.notify_match_performance_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
  v_status text;
  v_body text;
begin
  select r.player_id into v_athlete from public.player_ranks r where r.id = new.player_rank_id;
  if v_athlete is null then return new; end if;
  select m.status into v_status from public.match_results m where m.id = new.match_result_id;
  if v_status is distinct from 'confirmed' then return new; end if;
  v_body := case new.result when 'win' then 'ชนะ' when 'loss' then 'แพ้' else 'เสมอ' end
    || ' · คะแนนฝีมือ ' || new.rating_before || ' → ' || new.rating_after
    || ' (' || case when new.rating_change > 0 then '+' else '' end || new.rating_change || ')'
    || case when new.goals > 0 then ' · ' || new.goals || ' ประตู' else '' end
    || case when new.assists > 0 then ' · ' || new.assists || ' แอสซิสต์' else '' end
    || case when new.clean_sheet then ' · คลีนชีต' else '' end
    || case when new.mvp then ' · นักกีฬายอดเยี่ยม' else '' end;
  perform public.notify_athlete_family(v_athlete, 'match_result',
    'ผลแข่ง ' || coalesce(public.match_score_line(new.match_result_id), ''), v_body, '/career',
    'match_player:' || new.id::text);
  return new;
end;
$$;
revoke all on function public.notify_match_performance_created() from public, anon, authenticated;

drop trigger if exists match_performance_notify_family on public.match_player_performances;
create trigger match_performance_notify_family
after insert on public.match_player_performances
for each row execute function public.notify_match_performance_created();

create or replace function public.notify_match_result_voided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line text := public.match_score_line(new.id);
  v_athlete uuid;
  v_owner uuid;
begin
  if not (old.status = 'confirmed' and new.status = 'void') then return new; end if;
  for v_athlete in
    select distinct r.player_id
    from public.match_player_performances p
    join public.player_ranks r on r.id = p.player_rank_id
    where p.match_result_id = new.id and r.player_id is not null
  loop
    perform public.notify_athlete_family(v_athlete, 'match_result', 'ผลแข่งถูกยกเลิก: ' || coalesce(v_line, ''),
      'ผู้จัดยกเลิกผลนัดนี้ คะแนนฝีมือ แต้ม และเหรียญจากนัดนี้ถูกนำออกแล้ว', '/career', 'match_void:' || new.id::text);
  end loop;
  for v_owner in
    select distinct t.created_by from public.teams t
    where t.id in (new.team_a_id, new.team_b_id) and t.created_by is not null
  loop
    perform public.create_notification(v_owner, 'match_result', left('ผลแข่งถูกยกเลิก: ' || coalesce(v_line, ''), 160),
      'ผู้จัดยกเลิกผลนัดนี้ คะแนนฝีมือของนักกีฬาในนัดนี้กลับเป็นค่าก่อนแข่งแล้ว', '/dashboard/results',
      'match_void:' || new.id::text || ':owner:' || v_owner::text);
  end loop;
  return new;
end;
$$;
revoke all on function public.notify_match_result_voided() from public, anon, authenticated;

drop trigger if exists match_result_notify_voided on public.match_results;
create trigger match_result_notify_voided
after update of status on public.match_results
for each row execute function public.notify_match_result_voided();

-- Replaces sql/17's body: the badge's Thai name (messages/th.json, profileHome badges) instead
-- of its key, in the site's words (tests/vocabulary.test.ts: เหรียญ, แต้ม, ประวัติการเล่น),
-- and the athlete's accepted guardians are told too. Same source key for the athlete, so a
-- badge already announced is not announced again.
create or replace function public.notify_badge_earned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := case new.badge_key
    when 'rookie' then 'เริ่มต้น'
    when 'first_match' then 'นัดแรก'
    when 'first_win' then 'ชัยชนะแรก'
    when 'goal_hunter' then 'ประตูแรก'
    when 'playmaker' then 'แอสซิสต์แรก'
    when 'clean_sheet' then 'คลีนชีตแรก'
    when 'match_mvp' then 'นักกีฬายอดเยี่ยมครั้งแรก'
    when 'road_warrior' then 'นักสู้ 10 นัด'
    when 'rising_star' then 'ดาวรุ่ง'
    else replace(new.badge_key, '_', ' ') end;
  v_guardian uuid;
  v_child text;
begin
  perform public.create_notification(new.athlete_id, 'badge_earned', 'ได้เหรียญใหม่: ' || v_name,
    'ดูเหรียญและแต้มทั้งหมดของคุณได้ในประวัติการเล่น', '/career',
    'badge_earned:' || new.athlete_id::text || ':' || new.badge_key);
  if new.badge_key = 'rookie' then return new; end if;
  select coalesce(nullif(btrim(a.display_name), ''), 'ลูกของคุณ') into v_child
  from public.athlete_profiles a where a.user_id = new.athlete_id;
  for v_guardian in
    select g.guardian_id from public.guardian_links g
    where g.athlete_id = new.athlete_id and g.status = 'accepted' and g.guardian_id <> new.athlete_id
  loop
    perform public.create_notification(v_guardian, 'badge_earned',
      left(coalesce(v_child, 'ลูกของคุณ') || ' ได้เหรียญใหม่: ' || v_name, 160),
      'ดูความก้าวหน้าของลูกได้ที่หน้าครอบครัว', '/guardian',
      'badge_earned:' || new.athlete_id::text || ':' || new.badge_key || ':' || v_guardian::text);
  end loop;
  return new;
end;
$$;
revoke all on function public.notify_badge_earned() from public, anon, authenticated;

create or replace function public.notify_hall_of_fame_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text := case new.category
    when 'champion' then 'แชมป์'
    when 'mvp' then 'นักกีฬายอดเยี่ยม'
    when 'golden_boot' then 'ดาวซัลโว'
    when 'province_leader' then 'ที่ 1 ของจังหวัด'
    when 'rising_star' then 'ดาวรุ่ง'
    when 'fair_play' then 'น้ำใจนักกีฬา'
    else new.category end;
begin
  if new.athlete_id is null then return new; end if;
  perform public.notify_athlete_family(new.athlete_id, 'hall_of_fame',
    'ติดหอเกียรติยศ: ' || v_category || ' ฤดูกาล ' || new.season, new.citation, '/hall-of-fame',
    'hall_of_fame:' || new.id::text);
  return new;
end;
$$;
revoke all on function public.notify_hall_of_fame_entry() from public, anon, authenticated;

drop trigger if exists hall_of_fame_notify_entry on public.hall_of_fame_entries;
create trigger hall_of_fame_notify_entry
after insert on public.hall_of_fame_entries
for each row execute function public.notify_hall_of_fame_entry();

-- Replaces sql/17's body: the status in Thai and a link to the team's own page. Same key.
create or replace function public.notify_team_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  perform public.create_notification(
    new.created_by,
    'team_status',
    left('สถานะทีม ' || new.name || ': ' || case new.status
      when 'draft' then 'ร่าง (ยังแก้รายชื่อได้)'
      when 'pending' then 'ส่งสมัครแล้ว รอผู้จัดตรวจ'
      when 'confirmed' then 'ผู้จัดยืนยันแล้ว'
      when 'rejected' then 'ผู้จัดไม่รับสมัคร'
      else new.status end, 160),
    'เปิดหน้าทีมเพื่อดูรายละเอียดและขั้นต่อไป',
    '/team-members/' || new.id::text,
    'team_status:' || new.id::text || ':' || new.status
  );
  return new;
end;
$$;
revoke all on function public.notify_team_status_changed() from public, anon, authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.notify_athlete_family(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.notify_athlete_family(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.match_score_line(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') then
    raise exception 'SQL86 privileges are wider than intended';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'match_performance_notify_family' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'match_result_notify_voided' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'hall_of_fame_notify_entry' and not tgisinternal) then
    raise exception 'SQL86 triggers missing';
  end if;
end;
$$;

commit;
