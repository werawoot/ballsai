# Venue RPC EXECUTE least-privilege finding

Research date: 14 September 2026. Scope: the six existing BallDoenSai venue
RPCs in `sql/23-venues-and-bookings-v1.sql`. This is a design and migration
recommendation only; it does not change a database, Supabase configuration, or
any existing SQL migration.

## Finding

The production precheck found that the six `SECURITY DEFINER` venue functions
need their effective `EXECUTE` privileges re-affirmed. This is security
relevant even though each function checks `auth.uid()` or ownership internally:
`SECURITY DEFINER` runs with the function owner's privileges, and RLS does not
limit who can invoke a function. Access to the function itself is therefore a
separate least-privilege boundary.

PostgreSQL grants new functions `EXECUTE` to `PUBLIC` by default. `PUBLIC`
means every current and future role, so revoking only an application role does
not remove a privilege inherited via `PUBLIC`. PostgreSQL recommends revoking
the default `PUBLIC` privilege and granting execute selectively, in the same
transaction for newly created functions. [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html)
[PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html)

Supabase gives the same direction: functions are executable by any role by
default; RLS does not apply to function invocation; grant `EXECUTE` only to the
roles that need it. Its function guide explicitly shows revoking from `public`
and `anon`, then granting to `authenticated`. [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions)
[Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)

## Recommended migration action

Create a **new** numbered migration (never edit SQL23) that operates in one
transaction and targets only these exact function signatures:

```sql
begin;

revoke all on function public.create_venue_profile_safely(text, text, text, text, text, text[]) from public, anon, service_role;
revoke all on function public.create_venue_court_safely(uuid, text, text, text, integer) from public, anon, service_role;
revoke all on function public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer) from public, anon, service_role;
revoke all on function public.request_venue_booking_safely(uuid, text, text) from public, anon, service_role;
revoke all on function public.respond_venue_booking_safely(uuid, text) from public, anon, service_role;
revoke all on function public.cancel_venue_booking_safely(uuid) from public, anon, service_role;

grant execute on function public.create_venue_profile_safely(text, text, text, text, text, text[]) to authenticated;
grant execute on function public.create_venue_court_safely(uuid, text, text, text, integer) to authenticated;
grant execute on function public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.request_venue_booking_safely(uuid, text, text) to authenticated;
grant execute on function public.respond_venue_booking_safely(uuid, text) to authenticated;
grant execute on function public.cancel_venue_booking_safely(uuid) to authenticated;

commit;
```

The migration should first guard that all six exact `to_regprocedure(...)`
values exist, and should self-check before `commit` that `anon` and
`service_role` cannot execute each function while `authenticated` can. If any
guard or self-check fails, it must raise an exception so the transaction rolls
back.

Do not make a broad `ALTER DEFAULT PRIVILEGES` change as part of this venue
repair. Supabase documents it as an option for future functions, but it affects
the project's future functions and requires a separate inventory and owner
decision. [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions)

## SECURITY DEFINER follow-up

All six existing functions use `SECURITY DEFINER`. PostgreSQL says this means
they run with their owner's privileges and require a safe `search_path` to
avoid object-shadowing attacks. Supabase recommends `search_path = ''` with
fully schema-qualified names in the function body. [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html)
[Supabase: Database Functions](https://supabase.com/docs/guides/database/functions)

The existing bodies already schema-qualify their application relations, but
changing their `search_path` is a separate, behavior-sensitive hardening task.
It should be reviewed and migrated independently from this privilege repair.

## Required verification

After an explicitly approved production apply, verify each function with
`has_function_privilege` rather than only inspecting ACL rows:

```sql
select
  has_function_privilege('anon', 'public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer)', 'execute') as anon_can_execute,
  has_function_privilege('service_role', 'public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer)', 'execute') as service_role_can_execute,
  has_function_privilege('authenticated', 'public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer)', 'execute') as authenticated_can_execute;
```

Expected result for every one of the six functions: `false`, `false`, `true`.
Then run real-session allow/deny checks with separate venue-owner, requester,
and anonymous identities before a closed-beta booking flow is considered
proven.
