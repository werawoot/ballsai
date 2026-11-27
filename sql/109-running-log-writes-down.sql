-- Rollback of SQL109, either project, as postgres: add_my_run back to SQL108's, word for word, and
-- INSERT on run_logs for authenticated again.
begin;

create or replace function public.add_my_run(p_request_id uuid, p_run_date date, p_distance_m integer, p_duration_s integer)
returns uuid
language plpgsql
security invoker
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
grant insert on public.run_logs to authenticated;

commit;
