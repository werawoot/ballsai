# Architecture Decision Records — BallDoenSai.com

**Status:** updated **7 September 2026**. These ADRs capture the key architectural
decisions for BallDoenSai.com. Each follows the format: Context, Decision, Alternatives,
Reason, Consequences. New decisions go here as `ADR-NNN-<topic>.md` and are linked below.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-architecture-style.md) | Architecture Style | Accepted |
| [ADR-002](ADR-002-database.md) | Database & Schema Management | Accepted (with gap) |
| [ADR-003](ADR-003-mobile-architecture.md) | Mobile Architecture | Superseded by ADR-006 |
| [ADR-004](ADR-004-ai-architecture.md) | AI Architecture | Deferred / PLANNED |
| [ADR-005](ADR-005-data-architecture.md) | Data Architecture (season, verification, deletion) | Accepted |
| [ADR-006](ADR-006-mobile-led-multi-client.md) | Mobile-led Multi-client Architecture | Accepted |
| [ADR-007](ADR-007-multi-sport-identity-and-guardian-verification.md) | Multi-Sport Identity and Guardian Verification | Proposed |
| [ADR-008](ADR-008-team-roster-verified-match-integrity.md) | Team Roster and Verified Match Integrity | Accepted |

## How to use

- Before changing the architecture, check if an ADR covers it. If not, write one.
- Link the ADR from `../architecture/README.md` and `governance.md` where relevant.
- Supersede (do not delete) an ADR by adding a new one that states it replaces the old.

## AI coding agent note

Read these before proposing structural changes. They explain *why* the system is a
modular monolith on Supabase, why rating/XP are DB-triggered from verified results, and
why AI is intentionally absent for now. Respecting these decisions prevents accidental
re-architecture.
