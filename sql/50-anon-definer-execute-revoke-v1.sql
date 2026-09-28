-- 50-anon-definer-execute-revoke-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Run as postgres (the Supabase SQL Editor role).
--
-- Why: Supabase grants EXECUTE on every new function in public to anon, and Postgres
-- grants it to PUBLIC. A file that revokes only `from public` therefore leaves anon able to
-- call its SECURITY DEFINER functions directly through PostgREST. The inventory of
-- 28 September 2026 found many such functions on both Staging and Production. A review of
-- every definer function in the repository found none that acts for a signed-out caller
-- (each raises on a null auth.uid(), filters with `= auth.uid()`, or requires an admin),
-- so this is defence in depth, not an emergency fix: a signed-out visitor should not hold
-- EXECUTE on a definer function at all, and the next function a file forgets to guard
-- would otherwise be exploitable the moment it ships.
--
-- What: revoke anon and PUBLIC EXECUTE from every SECURITY DEFINER function in public and
-- audit, except the five that anonymous requests need; give back any EXECUTE that
-- authenticated or service_role lose in the process, so signed-in behaviour is unchanged;
-- and stop new functions in public from becoming anon-executable by default.
-- Extension functions are never touched.

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'SQL50 must run as postgres (found %): its default-privilege change is for role postgres', current_user;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'SQL50 requires the Supabase anon and authenticated roles';
  end if;
end;
$$;

-- Who could call each definer function before this migration.
create temp table sql50_before on commit drop as
select p.oid,
       n.nspname,
       p.proname || '(' || replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',') || ')' as signature,
       -- A REVOKE removes only grants the running role made, so postgres can change only
       -- the functions it owns: every function our migrations create. Supabase's defaults
       -- also grant anon EXECUTE on functions supabase_admin creates in public; those are
       -- reported below, not changed.
       pg_get_userbyid(p.proowner) = 'postgres' as owned_by_postgres,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_before,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_before,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_before
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'audit')
  and p.prokind = 'f'
  and p.prosecdef
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  );

do $$
declare
  -- The only definer functions a signed-out request may call:
  v_anon_allowed text[] := array[
    'is_admin()',                          -- evaluated inside RLS that anon reads through
    'is_organizer()',
    'is_accepted_guardian_for(uuid)',      -- RLS on public athlete pages
    'confirm_guardian_verification(text)', -- a guardian follows an emailed link, signed out
    'revoke_guardian_consent(text,text)'
  ];
  r record;
  v_other_owners text;
begin
  select string_agg(b.nspname || '.' || b.signature || ' (owner ' || b.owner || ')', ', ') into v_other_owners
  from sql50_before b
  where not b.owned_by_postgres and b.anon_before;
  if v_other_owners is not null then
    raise notice 'SQL50 left unchanged, owned by another role: %', v_other_owners;
  end if;

  for r in select * from sql50_before where owned_by_postgres loop
    if r.nspname = 'public' and r.signature = any (v_anon_allowed) then
      continue;
    end if;
    execute format('revoke execute on function %s from anon, public', r.oid::regprocedure);
    if r.authenticated_before and not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      execute format('grant execute on function %s to authenticated', r.oid::regprocedure);
    end if;
    if r.service_role_before and not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      execute format('grant execute on function %s to service_role', r.oid::regprocedure);
    end if;
  end loop;
end;
$$;

-- New functions postgres creates: no EXECUTE for PUBLIC or anon unless a file grants it
-- on purpose; signed-in users keep the default they have today in public.
-- Postgres's own EXECUTE-to-PUBLIC default is global, and a per-schema default can only
-- add to the global one, never remove from it, so PUBLIC (and anon, in case a global
-- grant exists) is revoked globally; Supabase's anon grant lives in schema public.
alter default privileges for role postgres
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated;

do $$
declare
  v_anon_allowed text[] := array[
    'is_admin()', 'is_organizer()', 'is_accepted_guardian_for(uuid)',
    'confirm_guardian_verification(text)', 'revoke_guardian_consent(text,text)'
  ];
  v_bad text;
  v_probe boolean;
begin
  -- 1. No definer function postgres owns outside the allowlist is callable by anon.
  --    Functions owned by another role were reported above and are not changed here.
  select string_agg(b.nspname || '.' || b.signature, ', ') into v_bad
  from sql50_before b
  where b.owned_by_postgres
    and not (b.nspname = 'public' and b.signature = any (v_anon_allowed))
    and has_function_privilege('anon', b.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'SQL50 left anon EXECUTE on: %', v_bad;
  end if;

  -- 2. Signed-in and service callers lost nothing.
  select string_agg(b.nspname || '.' || b.signature, ', ') into v_bad
  from sql50_before b
  where (b.authenticated_before and not has_function_privilege('authenticated', b.oid, 'EXECUTE'))
     or (b.service_role_before and not has_function_privilege('service_role', b.oid, 'EXECUTE'));
  if v_bad is not null then
    raise exception 'SQL50 removed signed-in or service EXECUTE from: %', v_bad;
  end if;

  -- 3. The allowlisted functions keep exactly the anon access they had.
  select string_agg(b.signature, ', ') into v_bad
  from sql50_before b
  where b.nspname = 'public' and b.signature = any (v_anon_allowed)
    and b.anon_before <> has_function_privilege('anon', b.oid, 'EXECUTE');
  if v_bad is not null then
    raise exception 'SQL50 changed anon access on an allowlisted function: %', v_bad;
  end if;

  -- 4. The default now holds for a new function (created and dropped inside this
  --    transaction, so nothing is left behind).
  create function public.sql50_default_privilege_probe() returns integer
    language sql as 'select 1';
  v_probe := has_function_privilege('anon', 'public.sql50_default_privilege_probe()', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.sql50_default_privilege_probe()', 'EXECUTE');
  drop function public.sql50_default_privilege_probe();
  if v_probe then
    raise exception 'SQL50 default privileges still let anon, or no longer let authenticated, execute a new function';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
