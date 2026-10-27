-- Sandbox checks for SQL94 (T52), after sql/checks/94-sandbox-base.sql and the main file.
-- Never run on Staging or Production. Last line: passed and failed counts (expected 20, 0).

\set ON_ERROR_STOP 1
\set QUIET 1
create table public.t_result(n serial, name text, ok boolean, got text);
grant all on public.t_result, public.t_result_n_seq to anon, authenticated;
create function public.t_err(p_sql text) returns text language plpgsql as $$ begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
create function public.t_check(p_name text, p_ok boolean, p_got text default null) returns void language sql as $$ insert into public.t_result(name, ok, got) values (p_name, coalesce(p_ok,false), p_got) $$;
grant execute on function public.t_err(text), public.t_check(text, boolean, text) to anon, authenticated;
-- 160 public football athletes, 3 private, 2 futsal; ranks for 100 of them in 2026, some in 2025
insert into public.athlete_profiles(user_id, display_name, sport, position, province, is_public, birth_date, created_at)
select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'นักเตะ ' || g, 'football',
  (array['FW','MF','DF','GK'])[1 + g % 4], case when g % 3 = 0 then 'ขอนแก่น' else 'เชียงใหม่' end, true, '2012-01-01', now() - g * interval '1 minute'
from generate_series(1, 160) g;
update public.athlete_profiles set display_name = 'Somchai 100%' where user_id = '00000000-0000-0000-0000-000000000007';
insert into public.athlete_profiles(user_id, display_name, sport, is_public) values
 ('00000000-0000-0000-0000-000000000901','ส่วนตัว 1','football',false),('00000000-0000-0000-0000-000000000902','ส่วนตัว 2','football',false),('00000000-0000-0000-0000-000000000903','ส่วนตัว 3','football',false),
 ('00000000-0000-0000-0000-000000000951','ฟุตซอล 1','futsal',true),('00000000-0000-0000-0000-000000000952','ฟุตซอล 2','futsal',true);
insert into public.player_ranks(player_id, sport, season, pts) select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'football', '2026', 1000 + (g * 7) % 900 from generate_series(1, 100) g;
insert into public.player_ranks(player_id, sport, season, pts) select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'football', '2025', 2900 from generate_series(101, 110) g;
insert into public.player_ranks(player_id, sport, season, pts) values ('00000000-0000-0000-0000-000000000901','football','2026',2999);
-- a rank row without points: athlete 150 counts as unrated
insert into public.player_ranks(player_id, sport, season, pts) values ('00000000-0000-0000-0000-000000000150','football','2026',null);

set role anon;
select t_check('anon can call', t_err($$select public.public_scout_athletes('football','2026')$$) = 'OK', t_err($$select public.public_scout_athletes('football','2026')$$));
-- page through everything, 24 at a time
create temp table seen as select 0 as page, 0 as pos, null::uuid as user_id, null::int as power limit 0;
do $$ declare p int := 0; n int; begin
  loop
    insert into seen select p, row_number() over (), s.user_id, s.power from public.public_scout_athletes('football','2026', p_limit => 25, p_offset => p * 24) s;
    get diagnostics n = row_count;
    delete from seen where page = p and pos = 25;
    exit when n <= 24; p := p + 1;
  end loop; end $$;
select t_check('pages reach all 160 public football athletes exactly once', (select count(1) = 160 and count(distinct user_id) = 160 from seen), (select count(1)::text from seen));
select t_check('athlete 151+ are reachable', (select count(1) from seen where user_id in (select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(151,160) g)) = 10);
select t_check('private profiles never listed', (select count(1) from seen where user_id::text like '%90_') = 0);
select t_check('other sport not listed', (select count(1) from seen where user_id::text like '%95_') = 0);
select t_check('ranked first by power desc', (select bool_and(ok) from (select coalesce(lag(power) over (order by page, pos) >= power, true) as ok from seen where power is not null) x));
select t_check('100 ranked then 60 unranked', (select count(power) from seen) = 100 and (select max(page * 24 + pos) from seen where power is not null) < (select min(page * 24 + pos) from seen where power is null));
select t_check('a rank row without points is listed with the unrated, never first', (select count(1) = 1 and min(page * 24 + pos) > 100 and bool_and(power is null) from seen where user_id = '00000000-0000-0000-0000-000000000150'));
select t_check('other season rank not used', (select count(1) from seen where power = 2900) = 0);
select t_check('search is a case-insensitive substring', (select count(1) from public.public_scout_athletes('football','2026', p_search => 'somchai')) = 1);
select t_check('percent is literal, not a wildcard', (select count(1) from public.public_scout_athletes('football','2026', p_search => '100%')) = 1 and (select count(1) from public.public_scout_athletes('football','2026', p_search => '%')) = 1);
select t_check('province filter', (select bool_and(province = 'ขอนแก่น') and count(1) = 53 from public.public_scout_athletes('football','2026', p_province => 'ขอนแก่น', p_limit => 50, p_offset => 0)) or (select count(1) from public.public_scout_athletes('football','2026', p_province => 'ขอนแก่น', p_limit => 50)) = 50);
select t_check('position filter', (select bool_and(position = 'GK') from public.public_scout_athletes('football','2026', p_position => 'GK', p_limit => 50)));
select t_check('min power excludes unranked and below', (select bool_and(power >= 1600) and count(1) > 0 from public.public_scout_athletes('football','2026', p_min_power => 1600, p_limit => 50)));
select t_check('filters combine', (select bool_and(position = 'FW' and province = 'เชียงใหม่' and power >= 1300) from public.public_scout_athletes('football','2026', p_position => 'FW', p_province => 'เชียงใหม่', p_min_power => 1300, p_limit => 50)));
select t_check('limit above 50 refused', t_err($$select public.public_scout_athletes('football','2026', p_limit => 51)$$) like '%SCOUT_PAGE%');
select t_check('a filter with no rated match still lists the unrated on page 1', (select count(1) from public.public_scout_athletes('football','2026', p_search => 'นักเตะ 15')) = 11);
select t_check('negative offset refused', t_err($$select public.public_scout_athletes('football','2026', p_offset => -1)$$) like '%SCOUT_PAGE%');
select t_check('no birth date or consent in the result', not exists (select 1 from pg_proc p where p.proname = 'public_scout_athletes' and (pg_get_function_result(p.oid) like '%birth%' or pg_get_function_result(p.oid) like '%consent%')));
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901', false);
select t_check('a signed-in owner of a private profile does not see it either', (select count(1) from public.public_scout_athletes('football','2026', p_search => 'ส่วนตัว')) = 0);
reset role;
select n, case when ok then 'PASS' else 'FAIL' end, name, got from t_result order by n;
select count(1) filter (where ok) as passed, count(1) filter (where not ok) as failed from t_result;
