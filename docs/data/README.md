# Data Dictionary & Schema Gaps — BallDoenSai.com

**Status:** updated **7 September 2026**.

This folder holds data-layer documentation. The primary ERD lives in
`../architecture/erd.md`; this file records **what is missing or inferred** so the team
does not treat assumptions as fact.

## What is verified (DDL in `sql/`)

These tables have authoritative `CREATE TABLE` statements in the repo and are safe to
reason about precisely:

`athlete_profiles`, `athlete_videos`, `athlete_achievements`,
`athlete_skill_assessments`, `player_ratings`, `rating_events`, `match_results`,
`match_player_performances`, `athlete_progress`, `athlete_xp_events`,
`athlete_badges`, `hall_of_fame_entries`, `athlete_highlights`,
`athlete_highlight_reports`, `notifications`, `team_members`,
`account_deletion_requests`.

## ⚠️ Gap: five core tables have no DDL in the repo

`profiles`, `tournaments`, `teams`, `player_ranks`, `payments` (and the `slips`
storage bucket) are referenced by RLS, RPC functions, and Next.js handlers, but **their
`CREATE TABLE` statements are not in any `sql/` file**. They were created directly in
the Supabase dashboard. Their columns in `erd.md` are **inferred** from:

- RLS policies in `sql/supabase-rls.sql` (`profiles.role`, `tournaments.organizer_id`,
  `teams.created_by`, `payments.team_id`, `player_ranks.player_id`, ...)
- RPC code in `sql/production-hardening.sql` (`teams.name/members/tournament_id/created_by/status`,
  `payments.slip_url/status`, `player_ranks.pts/ovr/rank_change/position/sport/season`)
- Route handlers in `app/api/**` (`tournaments.fee/promptpay/province/start_date/...`,
  `profiles.phone/province/team/position`, ...)

### Why this is a problem

A fresh Supabase project **cannot be reproduced from `sql/` alone**. Running the
numbered migrations in `docs/closed-beta-runbook.md` §3 will fail because steps 3–12
assume these tables already exist (they `ALTER`/`ENABLE RLS` on them). This blocks
disaster recovery and any new-environment provisioning.

### Recommended fix (before public launch)

1. Add migration files capturing the **real** DDL of these five tables, extracted from
   the live project (`hivedzrwrrcnjrlirhtv`) via `pg_dump` of just those tables.
2. Place them as `sql/00-core-profiles.sql`, `sql/00-core-tournaments.sql`,
   `sql/00-core-teams.sql`, `sql/00-core-player-ranks.sql`, `sql/00-core-payments.sql`
   and apply **before** step 3 in the runbook.
3. Document the `slips` bucket creation as a migration step (it is currently manual).
4. Add a CI check that `pg_dump` of the project matches the `sql/` folder (schema drift
   guard).

Until then, treat the inferred columns as *documented assumptions* and confirm against
the live database before relying on them.

### Staging baseline

`sql/00-core-schema-live-capture-v1.sql` is a bootstrap baseline for an empty Staging
or disaster-recovery environment. Its structure was captured read-only from live project
`hivedzrwrrcnjrlirhtv` on 7 September 2026. It must never be run against that existing
Production project, where the five core tables already exist.

The columns used by `sql/24-team-roster-integrity-v1.sql` were inspected read-only in
live project `hivedzrwrrcnjrlirhtv` on 7 September 2026. The relevant FK and nullable
contracts for `profiles`, `tournaments`, `teams` and `player_ranks` were confirmed.
This verification does not close the reproducible-DDL gap above.

## Verification levels (data provenance)

Athlete-facing data carries a `verification_level` (`athlete_profiles`) and
`source_level` (`athlete_skill_assessments`):

- `self` — athlete-entered.
- `coach_verified` — confirmed by a coach/organizer.
- `performance_verified` — derived from a confirmed match result.

The system rule (per `AGENTS.md`): never present a default as performance. A player
without a `player_ranks` row is a STARTER card and says so.

## Season scoping

All ranking/result/card queries read `ACTIVE_SPORT` / `ACTIVE_SEASON` from
`lib/season.ts` (build-time, defaults `football` / `2026`). This is the single source
for the active competition window.

## Proposed multi-sport migration

`sql/19-athlete-sport-profiles-v1.sql`,
`sql/20-guardian-verification-v2.sql`, and
`sql/21-sport-scoped-identity-v1.sql` are applied to project
`hivedzrwrrcnjrlirhtv`. They provide separate Sport Profiles, private email-verified
and revocable guardian consent, and sport-scoped progress/XP/Badges. RLS behavior
still requires verification with real closed-beta JWTs before public launch.

`sql/22-mobile-onboarding-v1.sql` is also applied. It adds the authenticated,
atomic onboarding RPC used by the Mobile app. `sql/23-mobile-onboarding-execute-grants-v1.sql`
records the required anon-execute revocation; confirm its live grant state before
inviting testers.
