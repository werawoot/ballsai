-- BallDoenSai.com data-deletion function privilege hardening V1
-- Apply after sql/data-deletion-v1.sql and before SQL34.
-- Supabase default privileges can grant EXECUTE on new functions directly to anon and
-- service_role. This self-service function must be callable only by an authenticated
-- user, and it still deletes data only for auth.uid(). Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('public.delete_my_athlete_data()') is null then
    raise exception 'SQL33 missing required function: public.delete_my_athlete_data()';
  end if;
end;
$$;

revoke all on function public.delete_my_athlete_data() from public, anon, service_role;
grant execute on function public.delete_my_athlete_data() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.delete_my_athlete_data()', 'execute') then
    raise exception 'SQL33 privilege check failed: anon can execute delete_my_athlete_data()';
  end if;
  if has_function_privilege('service_role', 'public.delete_my_athlete_data()', 'execute') then
    raise exception 'SQL33 privilege check failed: service_role can execute delete_my_athlete_data()';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_my_athlete_data()', 'execute') then
    raise exception 'SQL33 privilege check failed: authenticated cannot execute delete_my_athlete_data()';
  end if;
end;
$$;

commit;
