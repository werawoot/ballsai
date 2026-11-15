-- Read-only postcheck for SQL97, same project.
-- Expected on Production: options v_province_with_region:security_invoker=true
-- v_region_with_province_count:security_invoker=true; anon_provinces 85 and anon_regions 6
-- (the views still serve a signed-out caller everything they served before).
-- Expected on Staging: options NULL (no views there).
-- Run the anon counts only where the views exist.
-- No backslash or asterisk, so it survives copy and paste from chat.

select string_agg(c.relname || ':' || coalesce(array_to_string(c.reloptions, ','), 'none'), ' ' order by c.relname) as options
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('v_province_with_region', 'v_region_with_province_count');

-- Production only: what a signed-out caller sees through the views.
begin;
set local role anon;
select (select count(1) from public.v_province_with_region) as anon_provinces,
       (select count(1) from public.v_region_with_province_count) as anon_regions;
rollback;
