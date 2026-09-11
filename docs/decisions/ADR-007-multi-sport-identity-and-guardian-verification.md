# ADR-007 - Multi-Sport Identity and Guardian Verification

**Status:** Proposed
**Date:** 2026-09-06

## Context

ADR-006 establishes that one Athlete Identity may own several Sport Profiles, but the
current schema has one `athlete_profiles` row per user and its XP, badges and progress
are account-scoped. This would mix sport-specific identity data as the platform grows.
The current `guardian_consent_at` field also has no verified request, revocation, or
audit trail, while an athlete can currently write their own profile row.

## Decision

Keep one person-level `athlete_profiles` row, add a composite-key Sport Profile per
`(athlete_id, sport)`, and introduce new sport-scoped progress, XP-event and badge
tables. Existing Rating and Ranking remain scoped by sport and season. Migrate readers
gradually; do not rewrite or delete the current tables in place.

Guardian consent becomes a private, email-verified and revocable server-side flow with
request, consent and immutable audit records. For an under-20 athlete, an active
consent is required to make a Sport Profile public. No athlete client can write consent
state or a consent timestamp.

## Considered Options

- Add more sport columns to the one athlete profile: rejected because positions, teams,
  visibility and future sport metrics would become sparse and coupled.
- Keep account-wide XP and badges: rejected because it falsely rewards a Sport Profile
  with performance from another sport.
- Let a minor self-check a consent box: rejected because it is not guardian evidence.
- Add SMS from day one: deferred because sender compliance, delivery cost and recovery
  are not ready for Closed Beta.

## Consequences

This is additive but touches migrations, verified-result triggers, RLS, deletion,
Web readers and Mobile onboarding. No SQL or production data changes follow from this
ADR until the Founder approves the companion specification and the live schema for
project `hivedzrwrrcnjrlirhtv` is verified.
