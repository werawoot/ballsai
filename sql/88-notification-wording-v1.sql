-- 88-notification-wording-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/86 (notify_athlete_family and its triggers), sql/83
-- (notify_athlete_and_guardians), sql/17 (notify_match_result_created and its trigger).
-- Precheck: sql/88-notification-wording-precheck.sql. Postcheck:
-- sql/88-notification-wording-postcheck.sql. Rollback: sql/88-notification-wording-down.sql.
-- (87 is kept for the Staging catch-up of beta functions; this file does not depend on it.)
--
-- Why: code review of sql/86 (19 Oct 2026) found
--   * the coaches' result notice (sql/17) still said "ผลการแข่งขัน", a retired word;
--   * the void notice said medals were taken away even when none were (sql/65 removes a
--     badge only when the totals drop below its threshold);
--   * a badge earned again after a void was never announced, because its key named the
--     badge, not the earning. Owner's decision 19 Oct 2026 ("ก"): announce it again;
--   * the "athlete and accepted guardians" loop was written three times (sql/83, sql/86 twice).
-- What:
--   * One helper, notify_athlete_family(athlete, type, title, body, href, key, guardian body,
--     guardian href): the athlete, then each accepted guardian under the child's name.
--     sql/86's six-argument helper is dropped; sql/83's notify_athlete_and_guardians keeps
--     its signature and now calls it, so guardians of a team change see the child's name.
--   * Every sql/86 trigger function is recreated on the new helper with the same keys and
--     words, except: the void text, and the badge key, which now ends in the earning time
--     (athlete_badges is deleted only by a void and every insert is "on conflict do nothing",
--     so this fires once per real earning).
--   * notify_match_result_created (sql/17, team owners) says "ผลแข่ง" with the score, same key.
-- Scale: unchanged from sql/86. One row per person per event, source keys end in the
-- recipient, no broadcast; recipients by primary key and guardian_links_athlete_status_idx.

begin;

do $$
begin
  if to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text)') is null
     and to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text,text,text)') is null then
    raise exception 'Prerequisites missing: sql/86';
  end if;
  if to_regprocedure('public.notify_athlete_and_guardians(uuid,text,text,text,text)') is null
     or to_regprocedure('public.match_score_line(uuid)') is null then
    raise exception 'Prerequisites missing: sql/83, sql/86';
  end if;
end;
$$;

create or replace function public.notify_athlete_family(
  p_athlete uuid, p_type text, p_title text, p_body text, p_href text, p_key text,
  p_guardian_body text, p_guardian_href text
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
      left(coalesce(p_guardian_body, p_body, ''), 500), coalesce(p_guardian_href, '/guardian'),
      p_key || ':' || p_athlete::text || ':' || v_guardian::text);
  end loop;
end;
$$;
revoke all on function public.notify_athlete_family(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_athlete_and_guardians(p_athlete uuid, p_title text, p_body text, p_href text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_athlete_family(p_athlete, 'team_status', p_title, p_body, p_href, p_key, null, p_href);
end;
$$;
revoke all on function public.notify_athlete_and_guardians(uuid, text, text, text, text) from public, anon, authenticated;

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
    'match_player:' || new.id::text, null, null);
  return new;
end;
$$;
revoke all on function public.notify_match_performance_created() from public, anon, authenticated;

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
      'ผู้จัดยกเลิกผลนัดนี้ คะแนนฝีมือกลับเป็นค่าก่อนแข่ง แต้มและเหรียญที่ได้จากนัดนี้ถูกปรับตาม', '/career',
      'match_void:' || new.id::text, null, null);
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

-- Badge names as careerPage.badges in messages/th.json (tests/notification-sql-wording.test.ts).
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
  v_key text := 'badge_earned:' || new.badge_key || ':' || (extract(epoch from new.awarded_at) * 1000000)::bigint::text;
begin
  if new.badge_key = 'rookie' then
    perform public.create_notification(new.athlete_id, 'badge_earned', 'ได้เหรียญใหม่: ' || v_name,
      'ดูเหรียญและแต้มทั้งหมดของคุณได้ในประวัติการเล่น', '/career', v_key || ':' || new.athlete_id::text);
    return new;
  end if;
  perform public.notify_athlete_family(new.athlete_id, 'badge_earned', 'ได้เหรียญใหม่: ' || v_name,
    'ดูเหรียญและแต้มทั้งหมดของคุณได้ในประวัติการเล่น', '/career', v_key,
    'ดูความก้าวหน้าของลูกได้ที่หน้าครอบครัว', '/guardian');
  return new;
end;
$$;
revoke all on function public.notify_badge_earned() from public, anon, authenticated;

-- Category names as hallPage.category in messages/th.json (tests/notification-sql-wording.test.ts).
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
    'hall_of_fame:' || new.id::text, null, null);
  return new;
end;
$$;
revoke all on function public.notify_hall_of_fame_entry() from public, anon, authenticated;

-- sql/17's team owners' notice, in the site's words and with the score. Same key.
create or replace function public.notify_match_result_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_line text;
begin
  if new.status <> 'confirmed' then return new; end if;
  v_line := public.match_score_line(new.id);
  for v_owner in
    select distinct t.created_by from public.teams t
    where t.id in (new.team_a_id, new.team_b_id) and t.created_by is not null
  loop
    perform public.create_notification(v_owner, 'match_result', left('ผลแข่ง ' || coalesce(v_line, ''), 160),
      'ผู้จัดยืนยันผลแล้ว คะแนนฝีมือของนักกีฬาในทีมอัปเดตแล้ว', '/dashboard/results',
      'match_result:' || new.id::text || ':' || v_owner::text);
  end loop;
  return new;
end;
$$;
revoke all on function public.notify_match_result_created() from public, anon, authenticated;

drop function if exists public.notify_athlete_family(uuid, text, text, text, text, text);

do $$
begin
  if to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text)') is not null
     or (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'notify_athlete_family') <> 1 then
    raise exception 'SQL88: notify_athlete_family should have one signature';
  end if;
  if has_function_privilege('anon', 'public.notify_athlete_family(uuid,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_athlete_family(uuid,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.match_score_line(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.match_score_line(uuid)', 'execute')
     or has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_athlete_and_guardians(uuid,text,text,text,text)', 'execute') then
    raise exception 'SQL88 privileges are wider than intended';
  end if;
end;
$$;

commit;
