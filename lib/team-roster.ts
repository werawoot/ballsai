/**
 * Accepted-roster rules, shared by the results page (which loads the roster), the
 * match-result API (which validates it) and the organizer form (which filters it).
 *
 * A performance may only be recorded for an athlete with an `accepted` membership on
 * the exact team they are recorded under. `sql/24-team-roster-integrity-v1.sql`
 * enforces this inside `record_match_result_safely`; these helpers keep the UI and the
 * API from ever offering a selection the database will reject.
 *
 * Pure functions only — no Supabase, no writes. Membership rows are created and
 * changed exclusively through the approved RPCs.
 */

export type AcceptedMembership = {
  team_id: string
  athlete_id: string
}

export type RankedAthlete = {
  id: string
  player_id: string | null
  player_name: string
  position: string
  pts: number
}

export type RosterPlayer = RankedAthlete & { team_id: string }

export type PerformanceSelection = {
  playerRankId?: string
  teamId?: string
}

/** `team_id:athlete_id`, the key the roster check is expressed in everywhere. */
export function rosterKey(teamId: string, athleteId: string): string {
  return `${teamId}:${athleteId}`
}

export function acceptedRosterKeys(memberships: AcceptedMembership[]): Set<string> {
  return new Set(memberships.map(member => rosterKey(member.team_id, member.athlete_id)))
}

/**
 * One selectable entry per (accepted membership × ranked athlete). An athlete with an
 * accepted membership but no `player_ranks` row for the active sport/season is not
 * selectable — the rating transaction has nothing to update for them.
 */
export function buildRosterPlayers(
  memberships: AcceptedMembership[],
  ranked: RankedAthlete[],
): RosterPlayer[] {
  const rankByAthlete = new Map(
    ranked.flatMap(rank => (rank.player_id ? [[rank.player_id, rank] as const] : [])),
  )
  return memberships.flatMap(member => {
    const rank = rankByAthlete.get(member.athlete_id)
    return rank ? [{ ...rank, team_id: member.team_id }] : []
  })
}

/** The athletes an organizer may pick for one team. Empty until a team is chosen. */
export function rosterForTeam(players: RosterPlayer[], teamId: string): RosterPlayer[] {
  if (!teamId) return []
  return players.filter(player => player.team_id === teamId)
}

/**
 * Server-side guard mirroring the database check, so the API answers with a readable
 * message instead of letting the RPC raise. Returns the offending selections.
 */
export function rosterMismatches(
  performances: PerformanceSelection[],
  ranks: Array<{ id: string; player_id: string | null }>,
  accepted: Set<string>,
): PerformanceSelection[] {
  return performances.filter(item => {
    const rank = ranks.find(candidate => candidate.id === item.playerRankId)
    if (!rank?.player_id || !item.teamId) return true
    return !accepted.has(rosterKey(item.teamId, rank.player_id))
  })
}
