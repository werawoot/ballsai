-- 64-training-anon-execute-revoke-v1.sql
-- Pending review. Production (hivedzrwrrcnjrlirhtv) only with separate owner approval;
-- a no-op on Staging, safe to run there first. Depends on SQL63. Run as postgres.
-- Precheck: sql/64-training-anon-execute-revoke-precheck.sql.
--
-- Why: SQL63 revoked EXECUTE on training_self_start_programs() and training_today()
-- from PUBLIC only. On a project where SQL50 has not changed the default privileges
-- yet, Supabase grants EXECUTE on every new public function straight to anon, so the
-- revoke from PUBLIC left anon able to call both. Found on Production on 4 Oct 2026:
-- its fingerprint differed from Staging only in these two execute rights.
--
-- Neither function reads a table (a constant list and today's date in Thailand), and
-- anon has no access to the training tables, so nothing leaked. This file makes
-- Production match Staging and the rule "anon has no access" hold in the database.

begin;

do $$
begin
  if to_regprocedure('public.training_self_start_programs()') is null
     or to_regprocedure('public.training_today()') is null then
    raise exception 'SQL63 is not applied here: apply sql/63-training-v1.sql first';
  end if;
end;
$$;

revoke all on function public.training_self_start_programs() from public, anon;
revoke all on function public.training_today() from public, anon;
grant execute on function public.training_self_start_programs() to authenticated;
grant execute on function public.training_today() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.training_self_start_programs()', 'execute')
     or has_function_privilege('anon', 'public.training_today()', 'execute')
     or has_function_privilege('anon', 'public.training_enrollments_limit()', 'execute') then
    raise exception 'SQL64: anon can still execute a training function';
  end if;
  if not has_function_privilege('authenticated', 'public.training_self_start_programs()', 'execute')
     or not has_function_privilege('authenticated', 'public.training_today()', 'execute') then
    raise exception 'SQL64: authenticated lost execute on a training function';
  end if;
end;
$$;

commit;
