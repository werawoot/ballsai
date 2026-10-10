-- Rollback for SQL74 only (not part of the apply order). Removes the minutes tables, every
-- sheet in them and their functions.
begin;

do $$
begin
  if to_regclass('public.team_match_minutes') is null then
    raise exception 'SQL74 is not applied';
  end if;
end;
$$;

drop function if exists public.my_match_minutes();
drop function if exists public.save_match_minutes(uuid, uuid, integer, jsonb);
drop table if exists public.team_match_minute_entries;
drop table if exists public.team_match_minutes;
drop function if exists public.is_team_owner(uuid);

commit;
