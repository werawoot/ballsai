-- Rollback for SQL73 only (not part of the apply order). Removes the notes table, every
-- note in it and its functions.
begin;

do $$
begin
  if to_regclass('public.coach_athlete_notes') is null then
    raise exception 'SQL73 is not applied';
  end if;
end;
$$;

drop function if exists public.my_coach_notes(integer);
drop function if exists public.report_coach_note(uuid);
drop function if exists public.delete_coach_note(uuid);
drop function if exists public.write_coach_note(uuid, uuid, uuid, text, text);
drop table if exists public.coach_athlete_notes;
drop function if exists public.can_coach_read_note(uuid, uuid);
drop function if exists public.coach_note_health_word(text);

commit;
