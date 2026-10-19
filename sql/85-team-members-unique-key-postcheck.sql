-- Read-only postcheck for SQL85, same project.
-- Expected: unique_key true, key_columns 'team_id athlete_id', partial_idx false, members equal
-- to the precheck.
-- No backslash or asterisk, so it survives copy and paste from chat.

select exists (select 1 from pg_constraint where conrelid = 'public.team_members'::regclass
                 and conname = 'team_members_team_id_athlete_id_key' and contype = 'u') as unique_key,
       (select string_agg(a.attname, ' ' order by k.ord)
          from pg_constraint c
          cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         where c.conrelid = 'public.team_members'::regclass and c.conname = 'team_members_team_id_athlete_id_key') as key_columns,
       to_regclass('public.team_members_one_active_period_idx') is not null as partial_idx,
       (select count(1) from public.team_members) as members;
