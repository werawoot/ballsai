-- Rollback for SQL76 only (not part of the apply order). Removes the two functions. Names
-- coaches already set stay in profiles.full_name.
begin;

do $$
begin
  if to_regprocedure('public.team_roster_names(uuid[])') is null then
    raise exception 'SQL76 is not applied';
  end if;
end;
$$;

drop function if exists public.set_my_display_name(text);
drop function if exists public.team_roster_names(uuid[]);

commit;
