import type { StoredFixture } from '@/lib/fixture-draw'

// Sending the organiser from a fixture to the result form with its two teams chosen.
// SQL56 links a recorded result to the FIRST free fixture of the pair of teams (groups, then
// league, then knockout; by round, then key), so only that fixture offers the button:
// the others would link to the same one.

type Recordable = Pick<StoredFixture, 'fixture_key' | 'stage' | 'round' | 'home_team_id' | 'away_team_id' | 'match_result_id'>
const STAGE_ORDER = { group: 1, league: 2, knockout: 3 } as const

export function recordableFixtureKeys(fixtures: Recordable[]): Set<string> {
  const ordered = [...fixtures].sort((a, b) =>
    STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.round - b.round || (a.fixture_key < b.fixture_key ? -1 : a.fixture_key > b.fixture_key ? 1 : 0))
  const keys = new Set<string>()
  const seen = new Set<string>()
  for (const fixture of ordered) {
    if (!fixture.home_team_id || !fixture.away_team_id || fixture.match_result_id) continue
    const pair = [fixture.home_team_id, fixture.away_team_id].sort().join('|')
    if (seen.has(pair)) continue
    seen.add(pair)
    keys.add(fixture.fixture_key)
  }
  return keys
}

export const recordResultHref = (tournamentId: string, fixture: Pick<StoredFixture, 'home_team_id' | 'away_team_id'>) =>
  `/dashboard/results?tournament=${encodeURIComponent(tournamentId)}&teamA=${encodeURIComponent(fixture.home_team_id ?? '')}&teamB=${encodeURIComponent(fixture.away_team_id ?? '')}`

// The result form starts with these two teams only when both are confirmed teams of the
// tournament and different; anything else (a stale or hand-edited link) starts blank.
export function pickInitialTeams(teamA: string | undefined, teamB: string | undefined, confirmedTeamIds: string[]) {
  const ok = teamA && teamB && teamA !== teamB && confirmedTeamIds.includes(teamA) && confirmedTeamIds.includes(teamB)
  return ok ? { teamAId: teamA, teamBId: teamB } : { teamAId: '', teamBId: '' }
}
