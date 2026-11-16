-- 100-team-status-not-null-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Precheck: sql/100-team-status-not-null-precheck.sql. Postcheck:
-- sql/100-team-status-not-null-postcheck.sql. Rollback: sql/100-team-status-not-null-down.sql.
--
-- Why (T67, owner chose "make the columns NOT NULL" on 16 Nov 2026): several functions test a
-- column with "<>" and treat a null as a pass. create_tournament_team_safely (sql/20, sql/98) and
-- enter_tournament_from_team (sql/78) count a tournament with a null status as open;
-- enter_tournament_from_team lets anyone use a club team whose created_by is null;
-- withdraw_from_entry (sql/78) and invite_team_member (sql/20) do not lock a team whose status is
-- null. Fixing each function would also touch invite_team_member, which differs on Staging (beta
-- sql/24, ADR-010). Production allows null in all three columns; Staging already refuses it for
-- the two status columns. No row holds a null on either project (precheck, 16 Nov 2026), every
-- write path in the app and in sql/ sets the three values, and both status columns have a default.
-- What: teams.status, tournaments.status and teams.created_by become NOT NULL, so no function can
-- meet a null there again, including functions not written yet. Nothing else changes: no default,
-- check, policy or function. A column that is already NOT NULL is left as it is (Staging's two
-- status columns).
-- Stops, changing nothing, if any row holds a null in one of the three. Each table is locked
-- briefly while Postgres scans it (a few rows today; a full scan grows with the table).

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.tournaments') is null then
    raise exception 'SQL100 needs public.teams and public.tournaments';
  end if;
  if exists (select 1 from public.teams where status is null or created_by is null)
     or exists (select 1 from public.tournaments where status is null) then
    raise exception 'SQL100: a team or tournament row holds a null status or owner; review it by hand';
  end if;
end;
$$;

alter table public.teams alter column status set not null;
alter table public.teams alter column created_by set not null;
alter table public.tournaments alter column status set not null;

do $$
begin
  if (select count(1) from pg_attribute
      where attnotnull and not attisdropped and (attrelid, attname) in (
        ('public.teams'::regclass, 'status'), ('public.teams'::regclass, 'created_by'),
        ('public.tournaments'::regclass, 'status'))) <> 3 then
    raise exception 'SQL100 self-check failed';
  end if;
end;
$$;

commit;
