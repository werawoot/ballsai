-- 42-notification-privilege-hardening-v1.sql
-- Repairs the effective notification privilege boundary observed on production.
-- Apply only to Ballsai project hivedzrwrrcnjrlirhtv after SQL17 and with explicit
-- production-owner approval. This is additive: never edit SQL17 or SQL19.
--
-- public.create_notification() is an internal SECURITY DEFINER helper. Browser roles
-- must not call it, or insert/update notification data directly. They may read their
-- own rows through RLS and acknowledge only notifications.read_at.

begin;

do $$
begin
  if to_regclass('public.notifications') is null then
    raise exception 'SQL42 requires public.notifications from SQL17';
  end if;
  if to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null then
    raise exception 'SQL42 requires public.create_notification from SQL17';
  end if;
end;
$$;

-- The existing helper references public.notifications explicitly, so an empty path is
-- behaviour-preserving and prevents object shadowing. Do not recreate its applied body.
alter function public.create_notification(uuid, text, text, text, text, text)
  set search_path = '';

-- The helper is invoked only by trusted database functions and triggers.
revoke all on function public.create_notification(uuid, text, text, text, text, text) from public, anon, authenticated, service_role;

-- Browser access is deliberately limited to RLS-protected reads and read receipts.
revoke all on table public.notifications from public, anon, authenticated, service_role;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('service_role', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') then
    raise exception 'SQL42 function privilege verification failed';
  end if;

  if not has_table_privilege('authenticated', 'public.notifications', 'select')
     or has_table_privilege('authenticated', 'public.notifications', 'insert')
     or has_table_privilege('authenticated', 'public.notifications', 'references')
     or has_table_privilege('anon', 'public.notifications', 'select')
     or has_table_privilege('anon', 'public.notifications', 'insert')
     or not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update')
     or has_column_privilege('authenticated', 'public.notifications', 'body', 'update')
     or has_column_privilege('authenticated', 'public.notifications', 'user_id', 'update') then
    raise exception 'SQL42 table privilege verification failed';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
