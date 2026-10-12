-- Rollback for SQL77 only (not part of the apply order). Removes the guard: signed-in
-- users can change their own profiles.role and profiles.email again. Do not run on
-- Production unless the guard itself breaks sign-up or profile saving.
begin;

do $$
begin
  if to_regprocedure('public.profiles_guard_privileged_columns()') is null then
    raise exception 'SQL77 is not applied';
  end if;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
drop function if exists public.profiles_guard_privileged_columns();

commit;
