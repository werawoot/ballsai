# ADR-010 - Roster Rules for W1, and the Path to Nationwide

**Status:** Accepted (owner decision, 28 September 2026)
**Builds on:** ADR-008 *Team Roster and Verified Match Integrity* (on
`codex/player-card-beta`), which makes `team_members` the canonical roster and requires
every recorded performance to prove accepted membership.

## Context

Two migrations define the roster rules differently, and each replaces the same function,
so whichever is applied last silently wins:

| Rule | `sql/20-tournament-roster-flow-v1.sql` (main) | `sql/24-team-roster-integrity-v1.sql` + `sql/25-team-discovery-v1.sql` (beta only) |
| --- | --- | --- |
| When the roster may change | Only while the team is `draft`; `ROSTER_LOCKED` after submission | Never locked; SQL25 accepts join requests **only after** the team is `confirmed` |
| One athlete, how many teams per tournament | One (`ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER`) | Unlimited |
| Invitee must have an athlete profile | Yes (`ATHLETE_PROFILE_REQUIRED`) | No |

SQL24/25 also bring changes SQL20 lacks: membership history (removed and declined rows
kept, rejoin allowed), athlete-initiated join requests, a ten-minute resend cooldown, a
10-500 character removal reason, the accepted membership row stored on every recorded
performance, and **no direct `UPDATE` on `team_members` from browsers** (writes only
through RPCs). `sql/47-coach-beta-management-v1.sql` already assumes SQL20's lock: its
roster removal raises `ROSTER_LOCKED` unless the team is `draft`.

## Decision

### W1 (closed beta, 5 testers) - rules 1A, 2A, 3A

1. **1A - The roster locks when the team is submitted.** Invites, join requests,
   approvals and additions are allowed only while `teams.status = 'draft'`. After
   submission the roster does not change; an organizer who needs a change returns the team
   to `draft` first.
2. **2A - One team per athlete per tournament.** An athlete may hold a `pending` or
   `accepted` membership on only one team in a tournament, checked on every invite, join
   request and approval.
3. **3A - Join requests only while the team is `draft`.** This replaces SQL25's
   `confirmed`-only condition, which contradicts 1A.

Kept from SQL24/25 regardless: membership history, join requests, the cooldown, the
removal reason, the membership evidence on performances, and RPC-only writes to
`team_members`. Kept from SQL20: the athlete-profile requirement for an invitee, team
creation (`create_tournament_team_safely`), submission (`submit_tournament_team_safely`),
the payment guard and the roster guard on `match_player_performances`.

### Before the provincial pilot (task T42) - rule 1C

Replace 1A with **1C**: free changes while `draft`; after submission, additions and
removals remain possible but need the tournament organizer's approval and a recorded
reason; the roster locks for good when the tournament starts. Under 1A, every injury
substitution needs an organizer to reopen a team by hand, which does not scale to
hundreds of teams (nationwide rule 4 in `AGENTS.md`). 2A stays.

## Implementation

- One **new** migration merges the two rule sets. It is numbered **49**: 48 is taken by
  uncommitted guardian work in another checkout. It must redefine every function both
  files touch, so the outcome no longer depends on apply order.
- **Never apply `sql/20-tournament-roster-flow-v1.sql` or `sql/24-team-roster-integrity-v1.sql`
  directly** to a database that has the other one.
- The migration's starting point differs per environment. Before it is written, the
  read-only inventory (task T02/T03) must record whether Staging and Production have SQL20,
  SQL24 and SQL25. Its precheck must stop on any unexpected state.
- Staging first, then Production with separate approval, per the runbook.

## Consequences

- W1 organizers see a strict, simple roster: once a team is submitted, what was recorded is
  what played.
- SQL47's `ROSTER_LOCKED` behaviour already matches 1A and needs no change for W1. It must
  be revisited together with 1C.
- A team confirmed under SQL25's old rule, if any exists, would be locked under 1A; the
  migration's precheck must count such teams with pending requests.
- The one-team-per-tournament check runs on every invite and request. It uses the existing
  `team_members (athlete_id, status)` index from SQL18, so its cost does not grow with the
  number of teams nationwide.
