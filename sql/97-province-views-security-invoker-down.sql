-- Rollback for SQL97, same project, owner approval only. Puts both views back to reading with
-- their owner's rights (the state the security advisor reports as an ERROR). No data changes.

begin;

do $$
begin
  if to_regclass('public.v_province_with_region') is not null then
    alter view public.v_province_with_region reset (security_invoker);
  end if;
  if to_regclass('public.v_region_with_province_count') is not null then
    alter view public.v_region_with_province_count reset (security_invoker);
  end if;
end;
$$;

commit;
