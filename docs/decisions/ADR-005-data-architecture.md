# ADR-005 — Data Architecture

**Status:** Accepted
**Date:** 2026-08-30

## Context
The product is a "Digital Sports Identity" for minors. Data correctness, provenance,
privacy, and a single active competition window all matter. Mistakes here are reputational
and legal (PDPA), not just technical.

## Decision
1. **Single source of truth for the active window:** `lib/season.ts` exposes
   `ACTIVE_SPORT` / `ACTIVE_SEASON` (build-time, defaults `football` / `2026`). Every
   ranking/result/card/Hall query imports it — no season literals scattered in code.
2. **Verified-result integrity chain:** Rating, XP, Badge, and Ranking are derived *only*
   from a confirmed `match_results` row, via DB triggers on `rating_events`
   (`digital-identity-v1.sql`). XP is never granted from browser input.
3. **Verification levels:** athlete data carries `verification_level`
   (`self` / `coach_verified` / `performance_verified`) and skill assessments carry
   `source_level`. UI never presents a default as performance; a player without a
   `player_ranks` row is a STARTER card.
4. **Minor protection:** publishing a minor's profile requires birth date + guardian
   consent, enforced in the DB (`guardian-consent-enforcement-v1.sql`), not just the
   form.
5. **PDPA deletion:** `delete_my_athlete_data()` erases the athlete's own rows,
   **anonymises** ranking rows (keeps numbers other teams were measured against), clears
   personal profile fields, and files an `account_deletion_requests` row for an admin to
   finish removing the auth account. The app deliberately holds no service-role key, so
   auth-user removal stays a human step.

## Alternatives
- Store season per request param everywhere: rejected (drift risk; proven by the history
  in `lib/season.ts`).
- Compute XP in the app: bypassable; rejected.
- Hard-delete ranking rows on deletion: would corrupt other teams' rating history;
  rejected in favor of anonymise.
- Give the app a service-role key to auto-delete auth users: rejected (blast-radius
  risk with minors' data).

## Reason
Centralising the season, deriving identity from verified results, labelling provenance,
and anonymising on deletion make the platform trustworthy and lawful by construction.

## Consequences
- Pros: auditable identity, PDPA-aligned deletion, clear data provenance for coaches/
  scouts, no silent literals.
- Cons: rolling a new season needs a redeploy (build-time value); auth-user removal is a
  manual admin step (acceptable trade-off for safety). Team rosters are still free text
  (see `team_members` migration as the planned fix).
