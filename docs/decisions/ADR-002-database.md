# ADR-002 — Database & Schema Management

**Status:** Accepted (with a known gap)
**Date:** 2026-08-30

## Context
Schema changes must be safe, reviewable, and reproducible. The repo already uses a
numbered `sql/` migration set applied in a fixed order (see
`docs/closed-beta-runbook.md` §3).

## Decision
- Single Postgres database in Supabase (`hivedzrwrrcnjrlirhtv`), accessed only by the
  app's anon key plus `security definer` RPCs. **The app holds no service-role key.**
- Row Level Security is enabled on every table; access is gated by `is_admin()` /
  `is_organizer()` helper functions.
- Every schema/function change is a **new file in `sql/`**; applied migrations are never
  edited (see `AGENTS.md` rule 3).
- Domain integrity (rating, XP, badge, team/payment safety) lives in RPC functions and
  triggers.

## Alternatives
- Edit applied migrations in place: unsafe, loses history; rejected.
- Let the app do raw writes: breaks RLS guarantees; rejected.
- Multiple databases per domain: premature for current scale; rejected.

## Reason
The migration-file discipline plus RLS makes the schema the reviewed source of truth and
keeps risky writes server-side and concurrency-safe (e.g. `RATING_CHANGED` conflict
handling in `record_match_result_safely`).

## Consequences
- Pros: auditable, safe, agent-friendly (change = new SQL file + runbook row).
- **Gap (must fix before public launch):** the DDL for five core tables
  (`profiles`, `tournaments`, `teams`, `player_ranks`, `payments`) and the `slips`
  bucket is **not in `sql/`** — it was created manually in the Supabase dashboard. A
  fresh environment cannot be rebuilt from `sql/` alone. See `../data/README.md`.
- Action: add `sql/00-core-*.sql` extracted from the live project and a schema-drift CI
  check before public launch.
