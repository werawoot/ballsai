-- Rollback for SQL88, same project, owner approval. Puts back sql/86's six-argument helper
-- and its five trigger functions, sql/83's notify_athlete_and_guardians and sql/17's
-- notify_match_result_created, each unchanged, then drops the eight-argument helper.
-- Notifications already sent stay.

begin;

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

create or replace function public.notify_athlete_and_guardians(p_athlete uuid, p_title text, p_body text, p_href text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guardian uuid;
begin
  perform public.create_notification(p_athlete, 'team_status', p_title, p_body, p_href, p_key || ':' || p_athlete::text);
  for v_guardian in
    select g.guardian_id from public.guardian_links g where g.athlete_id = p_athlete and g.status = 'accepted'
  loop
    perform public.create_notification(v_guardian, 'team_status', p_title, p_body, p_href, p_key || ':' || p_athlete::text || ':' || v_guardian::text);
  end loop;
end;
$$;

create or replace function public.notify_match_result_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.status <> 'confirmed' then return new; end if;
  for v_owner in
    select distinct t.created_by
    from public.teams t
    where t.id in (new.team_a_id, new.team_b_id)
      and t.created_by is not null
  loop
    perform public.create_notification(
      v_owner,
      'match_result',
      'มีผลการแข่งขันใหม่ในระบบ',
      'ผลการแข่งขันได้รับการยืนยันแล้ว และข้อมูลทีมของคุณพร้อมอัปเดต',
      '/dashboard/results',
      'match_result:' || new.id::text || ':' || v_owner::text
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_athlete_family(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_match_performance_created() from public, anon, authenticated;
revoke all on function public.notify_match_result_voided() from public, anon, authenticated;
revoke all on function public.notify_badge_earned() from public, anon, authenticated;
revoke all on function public.notify_hall_of_fame_entry() from public, anon, authenticated;
revoke all on function public.notify_athlete_and_guardians(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_match_result_created() from public;
drop function if exists public.notify_athlete_family(uuid, text, text, text, text, text, text, text);

commit;
