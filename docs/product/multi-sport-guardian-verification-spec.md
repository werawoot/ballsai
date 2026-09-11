# Multi-Sport Identity & Guardian Verification

**Status:** DATABASE APPLIED - migrations 19, 20, and 21 are applied to Supabase project
`hivedzrwrrcnjrlirhtv`. The end-to-end flow still needs testing with real closed-beta
JWTs and organizer-confirmed results.

## Goal

Give one athlete one account with a separate Sport Profile for every sport. Ratings,
Rankings, XP, Badges, performances and public visibility are always scoped to that
Sport Profile. At the same time, protect an under-20 athlete's public discovery profile
through a guardian verification flow that the athlete cannot self-approve.

## Non-negotiable rules

1. An Athlete Identity is one person and one authenticated account. It is not a
   football-only profile.
2. A Sport Profile is the pair `(athlete_id, sport)`. An athlete can have football,
   futsal and basketball profiles without creating three accounts.
3. Rating, Ranking, match performance, XP and Badge are never combined across sports.
   A football result cannot improve a futsal or basketball profile.
4. A Sport Profile without a verified `player_ranks` record is STARTER. UI must not
   display default statistics as verified performance.
5. A guardian verification request is not consent. Only the backend can create an
   active Guardian Consent after the guardian completes the verification link.
6. Guardian Consent enables public disclosure for an under-20 athlete. It does not
   establish every legal basis for processing a minor's data; that policy needs legal
   review before public launch.

## Proposed ownership

| Concern | Owner | Scope |
| --- | --- | --- |
| Account, birth date, avatar, guardian-consent state | `athlete_profiles` | Athlete Identity |
| Position, team, province, public visibility | `athlete_sport_profiles` | Athlete + sport |
| Power Rating, Ranking, results | existing rating chain | Athlete + sport + season |
| XP, level, badges, XP events | new sport-scoped identity tables | Athlete + sport |
| Guardian request, consent, audit events | new private consent tables | Athlete Identity |

`athlete_profiles` remains the person-level profile for compatibility during migration.
Its current `sport`, position, province, team and `is_public` fields are legacy values
once Sport Profiles exist; readers must move gradually rather than deleting them in the
same release.

## Proposed schema

### `athlete_sport_profiles`

One row per athlete and sport. Composite primary key `(athlete_id, sport)` avoids a
second artificial identity and matches the existing `player_ranks` sport scope.

| Column | Meaning |
| --- | --- |
| `athlete_id` | FK to `athlete_profiles.user_id` |
| `sport` | Canonical sport slug, initially `football`, `futsal`, or `basketball` |
| `position`, `current_team`, `province` | Self-entered sport-specific context |
| `is_public` | Visibility of this sport profile; false by default |
| `status` | `active` or `archived`; archived profiles stay historically linked but are not discoverable |
| `created_at`, `updated_at` | Audit timestamps |

### Sport-scoped progress

Add new tables rather than changing primary keys on live identity tables in place:

- `athlete_sport_progress (athlete_id, sport, xp_total, current_level)`
- `athlete_sport_xp_events (id, athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)`
- `athlete_sport_badges (athlete_id, sport, badge_key, source_rating_event_id, awarded_at)`

The old `athlete_progress`, `athlete_xp_events` and `athlete_badges` remain read-only
legacy data until all Web and Mobile readers move. New verified events write only to
the sport-scoped tables. The migration must backfill sport from `rating_events` and
`player_ratings`; legacy rookie XP is assigned only to the athlete's original sport and
marked as migrated.

### Guardian verification

For the first release, the delivery channel is **email only**. Phone/SMS is deliberately
out of scope until a Thai SMS provider, sender identity, cost limits and recovery path
are approved.

- `guardian_verification_requests`: private request, guardian name/relationship/email,
  token hash, status (`pending`, `verified`, `expired`, `cancelled`), requested and
  expiry timestamps.
- `guardian_consents`: the active or revoked consent record, linked to the request,
  guardian email, verified timestamp, revoked timestamp and revocation reason.
- `guardian_consent_events`: append-only audit history (`requested`, `verified`,
  `revoked`, `expired`, `cancelled`) with actor and request reference.

Raw verification tokens never persist. The server stores only a hash and sends the
single-use raw token by email. Guardian email addresses are private PII: no public
select policy, no analytics payload, and masked in admin lists unless access is needed.

## Guardian flow

```mermaid
sequenceDiagram
  participant A as Athlete (Mobile/Web)
  participant API as Shared Backend
  participant DB as Supabase
  participant G as Guardian email

  A->>API: Request guardian verification
  API->>DB: Create pending request + audit event
  API->>G: Single-use verification link
  G->>API: Open link and confirm disclosure
  API->>DB: Mark request verified; create active consent + audit event
  DB-->>DB: Permit Sport Profile public visibility
  G->>API: Revoke later if needed
  API->>DB: Revoke consent + set all Sport Profiles private
```

An active consent is a prerequisite for an under-20 athlete to make any Sport Profile
public. Revocation immediately makes every Sport Profile private; it does not delete
the athlete's private records or confirmed match history.

## Migration and rollout

1. Add tables, indexes, RLS and backend-only consent RPCs in new numbered SQL files.
   Do not edit any applied SQL file.
2. Backfill one Sport Profile from every existing `athlete_profiles.sport` row, retaining
   the legacy column values during transition.
3. Backfill sport-scoped progress. Reconcile totals against source events before moving
   any UI reader.
4. Update Web reads and writes to the new model, keeping a feature flag or compatibility
   reader for pre-migration profiles.
5. Update Mobile onboarding persistence and sport switcher only after the shared backend
   contract exists.
6. Run real-JWT RLS tests for athlete, guardian, organizer, admin and anonymous viewer.
7. Pilot with football only. Add futsal only after the complete verified-result loop,
   consent request and revocation are proven.

## Explicitly not in this release

- AI recommendations or AI-written profile data.
- SMS consent delivery.
- Cross-sport Rating, Ranking, XP, Badge or leaderboard.
- A separate Mobile database or direct client writes to performance tables.
- Claims that guardian consent is a complete legal determination; legal review remains
  required before public launch.

## Approved rollout decisions

1. Closed Beta guardian verification is email-only.
2. Guardian consent governs public disclosure; broader minor-data policy still needs
   legal review before public launch.
3. Legacy rookie XP belongs to the athlete's original sport and is never pooled across
   Sport Profiles.
4. Football is the only write-enabled pilot. Futsal and basketball profiles can exist,
   but their result workflows do not launch until separately proven.
