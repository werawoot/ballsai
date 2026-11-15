-- Read-only precheck for SQL97, same project.
-- Expected on Production: both views present with options null (no security_invoker yet);
-- province_read and region_read true (the one SELECT policy for role public is there, and anon
-- may select), province_rows 85, region_rows 6. If province_read or region_read is false,
-- STOP: with security_invoker the views would return nothing to callers without access.
-- Expected on Staging: views_present 0 (the file then changes nothing).
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select count(1) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('v_province_with_region', 'v_region_with_province_count')) as views_present,
       (select string_agg(c.relname || ':' || coalesce(array_to_string(c.reloptions, ','), 'none'), ' ' order by c.relname)
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('v_province_with_region', 'v_region_with_province_count')) as options,
       to_regclass('public.province') is not null
         and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'province' and cmd = 'SELECT' and 'public' = any(roles))
         and has_table_privilege('anon', 'public.province', 'select') as province_read,
       to_regclass('public.region') is not null
         and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'region' and cmd = 'SELECT' and 'public' = any(roles))
         and has_table_privilege('anon', 'public.region', 'select') as region_read;
