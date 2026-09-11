# ADR-008 - Team Roster and Verified Match Integrity

**Status:** Accepted
**Date:** 2026-09-07

## Context

`record_match_result_safely()` currently verifies the organizer, tournament, teams and
rating rows, but it does not prove that a ranked athlete belongs to the team attached
to a performance. The results UI also offers every `player_ranks` row in the active
season. A wrong selection can therefore create Rating, XP and Badge data for an athlete
who did not represent that team.

The live schema of Supabase project `hivedzrwrrcnjrlirhtv` was inspected before this
decision. It confirms the existing foreign keys and the one-row-per-team-and-athlete
constraint on `team_members`. It also confirms that several legacy core columns are
nullable, so validation must fail closed rather than infer missing relationships.

## Decision

Use `team_members` as the canonical roster relationship. Membership is historical:
only one `pending` or `accepted` period may exist for an athlete and team, while removed
or declined rows remain as evidence and the athlete may later rejoin.

A performance can be confirmed only when all of these links exist:

`player_ranks.player_id -> team_members.athlete_id -> team_members.team_id -> teams.tournament_id`

The accepted membership row is stored on `match_player_performances` together with the
time it was checked. This preserves proof even if the athlete leaves the team later.
There is no administrator override in Closed Beta; a broken link blocks confirmation.

Team creators may manage only their own roster. Tournament organizers and admins keep
their existing scope. Membership requests are limited to one active request per athlete
and team, with a ten-minute resend cooldown. Removal requires a 10-500 character reason.

`performance_verified` means a linked rank plus at least one recorded match in
`player_ratings.matches_played`; a rank row by itself is not verified performance.

## Considered Options

- Keep free-text rosters and search the season ranking: rejected because it cannot
  prove team membership.
- Reuse one membership row forever: rejected because leave/rejoin history would be
  overwritten.
- Allow an admin override: rejected for Closed Beta because it weakens the integrity
  claim and requires a second audit path.
- Revalidate historical matches: rejected because older matches were recorded before
  canonical rosters existed and cannot be reconstructed reliably.

## Consequences

Migration 24 adds membership lifecycle fields, a partial active-membership index and
immutable membership evidence on new performances. Existing performance rows remain
valid historical records but have no roster snapshot. Organizers must reconcile pilot
rosters before recording the next match.

The results UI and API must use accepted roster members only. Mobile readers must gate
verified performance on `matches_played > 0`; this is coordinated separately in the
mobile repository. Migration 24 must be applied to staging and exercised with real JWTs
before production.
