-- BallDoenSai.com data-deletion function search-path hardening V1
-- Apply only after SQL16 and SQL33, and only to project hivedzrwrrcnjrlirhtv.
-- This is intentionally a new migration: SQL16 is already part of production history.

begin;

do $$
begin
  if to_regprocedure('public.delete_my_athlete_data()') is null then
    raise exception 'SQL36 missing required function: public.delete_my_athlete_data()';
  end if;
end;
$$;

alter function public.delete_my_athlete_data()
  set search_path = '';

-- Preserve SQL33's least-privilege function access after changing its settings.
revoke all on function public.delete_my_athlete_data() from public, anon, service_role;
grant execute on function public.delete_my_athlete_data() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.delete_my_athlete_data()', 'execute')
    or has_function_privilege('service_role', 'public.delete_my_athlete_data()', 'execute')
    or not has_function_privilege('authenticated', 'public.delete_my_athlete_data()', 'execute') then
    raise exception 'SQL36 privilege check failed for delete_my_athlete_data()';
  end if;
end;
$$;

commit;
