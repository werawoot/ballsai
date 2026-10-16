-- 80-payments-one-per-team-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, where it changes nothing; Production
-- (hivedzrwrrcnjrlirhtv) only with separate owner approval. Read the Project ID in
-- Settings > General before each run. Run as postgres.
-- Precheck: sql/80-payments-one-per-team-precheck.sql. Postcheck:
-- sql/80-payments-one-per-team-postcheck.sql. Rollback: sql/80-payments-one-per-team-down.sql.
--
-- Why: the SQL79 precheck on Production (16 Oct 2026) found that payments has no index on
-- team_id at all. Staging has payments_one_payment_per_team_idx from step 3
-- (sql/supabase-rls.sql); Production does not, so that part of step 3 never reached it.
--   - /api/teams/[teamId]/payment checks for an existing payment and then inserts. Two
--     uploads at the same moment can both pass the check; only this unique index stops
--     the second row. Without it a team can end up with two payments.
--   - Every read of a team's payment (the slip route, the organizer's confirm, SQL79's
--     delete check) scans the whole table instead of using an index.
-- What: the same unique index as sql/supabase-rls.sql, under the same name, so Staging and
-- Production match. Refuses, changing nothing, if any team already has two payments; those
-- must be reviewed by hand first (the precheck lists the count).

begin;

do $$
begin
  if to_regclass('public.payments') is null then
    raise exception 'Prerequisite missing: public.payments';
  end if;
  if exists (select team_id from public.payments where team_id is not null group by team_id having count(1) > 1) then
    raise exception 'SQL80: some teams have more than one payment; review them by hand before adding the unique index';
  end if;
end;
$$;

create unique index if not exists payments_one_payment_per_team_idx on public.payments (team_id);

commit;
