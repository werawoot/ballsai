-- Read-only precheck for SQL77. Read the Project ID in Settings > General first.
-- Expected before SQL77 (Staging and Production): prerequisites true, guard false,
-- can_update_role true (the hole SQL77 closes). admins / organizers: counts to review by
-- hand afterwards in Table Editor > profiles (filter role) against the people you appointed.

select to_regprocedure('public.is_admin()') is not null
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') as prerequisites,
       exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_guard_privileged_columns') as guard,
       has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as can_update_role,
       (select count(id) from public.profiles where role = 'admin') as admins,
       (select count(id) from public.profiles where role = 'organizer') as organizers;
