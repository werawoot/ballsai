-- 109-running-log-writes-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval, in the same session as SQL108 (apply 108 then 109). Read the Project ID in
-- Settings > General before each run. Run as postgres. Needs SQL108.
-- Precheck: sql/109-running-log-writes-precheck.sql. Postcheck: sql/109-running-log-writes-postcheck.sql.
-- Rollback: sql/109-running-log-writes-down.sql (back to SQL108's add_my_run and grant).
--
-- Why (code review of SQL108, 27 Nov 2026): add_my_run ran as its caller and run_logs granted INSERT
-- to authenticated, so a signed-in account could insert straight through the REST API and skip the
-- function's checks (no run in the future, 10 a day), and set its own id and created_at; and the
-- 10-a-day count was read then written with no lock, so two requests at once could both pass at 9.
-- What:
--   - authenticated loses INSERT on run_logs: a run is added only through add_my_run;
--   - add_my_run is SQL108's word for word except SECURITY DEFINER (it still checks auth.uid() and
--     writes only the caller's own run) and a transaction lock per account and day before the
--     count. Same name, arguments, return and grants.
-- No row changes. Rows today: 0 runs on Staging; the table is new on Production.

begin;

do $$
begin
  if to_regprocedure('public.add_my_run(uuid,date,integer,integer)') is null or to_regclass('public.run_logs') is null then
    raise exception 'SQL109 needs SQL108 on this project first';
  end if;
end;
$$;

revoke insert on public.run_logs from authenticated;

create or replace function public.add_my_run(p_request_id uuid, p_run_date date, p_distance_m integer, p_duration_s integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null or p_run_date is null or p_distance_m is null or p_duration_s is null then
    raise exception 'RUN_INVALID' using errcode = '22023';
  end if;
  -- A retried save (the same request) is the run already saved.
  select id into v_id from public.run_logs where user_id = v_user_id and request_id = p_request_id;
  if found then
    return v_id;
  end if;
  if p_run_date > (now() at time zone 'Asia/Bangkok')::date or p_run_date < date '2020-01-01' then
    raise exception 'RUN_DATE_INVALID' using errcode = '22023';
  end if;
  if p_distance_m not between 100 and 100000 or p_duration_s not between 60 and 86400
     or p_duration_s::bigint * 1000 < p_distance_m::bigint * 150 then
    raise exception 'RUN_INVALID' using errcode = '22023';
  end if;
  -- One add per account and day at a time (sql/109): two requests at once cannot both pass the
  -- count below. The lock ends with the transaction.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_run_date::text, 108));
  if (select count(1) from public.run_logs where user_id = v_user_id and run_date = p_run_date) >= 10 then
    raise exception 'RUN_DAY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.run_logs (user_id, request_id, run_date, distance_m, duration_s)
  values (v_user_id, p_request_id, p_run_date, p_distance_m, p_duration_s)
  on conflict (user_id, request_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.run_logs where user_id = v_user_id and request_id = p_request_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.add_my_run(uuid, date, integer, integer) from public, anon;
grant execute on function public.add_my_run(uuid, date, integer, integer) to authenticated;

commit;
