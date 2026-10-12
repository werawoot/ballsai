-- 77-profile-privilege-guard-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on public.profiles (role, email), public.is_admin() and auth.users.
-- Run as postgres. Precheck: sql/77-profile-privilege-guard-precheck.sql.
-- Postcheck: sql/77-profile-privilege-guard-postcheck.sql.
-- Rollback: sql/77-profile-privilege-guard-down.sql.
--
-- Why (found 12 Oct 2026; Production checked read-only by the owner the same day:
-- authenticated may UPDATE profiles.role, no trigger on profiles, and the only update
-- policy is "own row or admin"):
--
--   * Any signed-in user could make themselves an admin or an organizer:
--       update profiles set role = 'admin' where id = auth.uid()
--     straight from the browser with the anon key. An admin reads every athlete's data,
--     minors included. profiles_insert_own let a user with no profiles row insert one with
--     role 'admin' in the same way.
--   * Any signed-in user could set profiles.email to someone else's address.
--     invite_organization_member_safely (sql/26) finds the invitee by profiles.email, so
--     an invitation meant for that person could reach the wrong account.
--
-- Fix: one BEFORE INSERT OR UPDATE trigger on public.profiles. A signed-in user who is
-- not an admin may not set role to anything but 'user' on insert, may not change role,
-- and may set email only to the address of their own auth account. Nothing else changes:
-- every other column keeps its grants and policies, and the app never writes role or
-- email (EditProfileForm and PlayerCardBuilder send full_name, province, team, position;
-- /welcome sends the onboarding answers).
--
-- Still allowed, on purpose:
--   * the SQL Editor and server jobs (no auth.uid()), which is how an admin sets
--     profiles.role today (runbook "profiles.role"); and handle_new_user() at sign-up;
--   * a signed-in admin (public.is_admin());
--   * the definer functions that update profiles (sql/47 PDPA erase, sql/76 display
--     name): they never touch role or email, so the trigger lets them through.
--
-- Cost at scale: the trigger fires only when role or email is in the statement
-- (UPDATE OF role, email) or on INSERT; it reads one auth.users row by primary key.

begin;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') then
    raise exception 'Prerequisites missing: public.profiles (role, email) and public.is_admin()';
  end if;
end;
$$;

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_auth_email text;
begin
  -- The SQL Editor, server jobs, sign-up (handle_new_user) and admins.
  if v_user is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.role, 'user') <> 'user' then
      raise exception 'ROLE_CHANGE_NOT_ALLOWED' using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role then
    raise exception 'ROLE_CHANGE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if new.email is not null
     and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    select u.email into v_auth_email from auth.users u where u.id = new.id;
    if v_auth_email is null or lower(new.email) <> lower(v_auth_email) then
      raise exception 'EMAIL_CHANGE_NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_guard_privileged_columns() from public, anon, authenticated;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
before insert or update of role, email on public.profiles
for each row execute function public.profiles_guard_privileged_columns();

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_guard_privileged_columns'
      and tgenabled = 'O'
  ) then
    raise exception 'SQL77 trigger is missing or disabled';
  end if;
  if has_function_privilege('authenticated', 'public.profiles_guard_privileged_columns()', 'execute')
     or has_function_privilege('anon', 'public.profiles_guard_privileged_columns()', 'execute') then
    raise exception 'SQL77 function privileges are wider than intended';
  end if;
end;
$$;

commit;
