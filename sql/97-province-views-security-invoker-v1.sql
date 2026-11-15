-- 97-province-views-security-invoker-v1.sql
-- Pending: not applied. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Run as postgres. Precheck:
-- sql/97-province-views-security-invoker-precheck.sql. Postcheck:
-- sql/97-province-views-security-invoker-postcheck.sql. Rollback:
-- sql/97-province-views-security-invoker-down.sql.
--
-- Why (owner, 15 Nov 2026): the Supabase security advisor reports two ERRORs on Production,
-- "security_definer_view" for public.v_province_with_region and
-- public.v_region_with_province_count. A view without security_invoker reads its tables with
-- its owner's rights, so it skips the RLS of public.province and public.region. Neither view is
-- in sql/: they were made on Production outside this record, with their tables (Staging has
-- neither the views nor the tables, 15 Nov 2026).
--
-- What: both views read with the caller's rights (security_invoker = true). Nothing else
-- changes: same columns, same rows. Today province and region each have one policy, "Enable
-- read access for all users" (SELECT, role public), and anon and authenticated have SELECT on
-- the tables, so every caller sees the same 85 provinces and 6 regions as before. The data is
-- reference data (names of provinces and regions), not personal.
--
-- A view that does not exist is skipped, so the file is safe where the views were never made.

begin;

do $$
begin
  if to_regclass('public.v_province_with_region') is not null then
    alter view public.v_province_with_region set (security_invoker = true);
  end if;
  if to_regclass('public.v_region_with_province_count') is not null then
    alter view public.v_region_with_province_count set (security_invoker = true);
  end if;
end;
$$;

commit;
