// A coach's team page: this season's numbers per member and the team sheet, from what the
// database already holds. Numbers come only from confirmed match results (a voided match
// is left out), so they are performance_verified (AGENTS.md rule 8); a member with no
// verified match has no numbers at all, never zeros. The team sheet carries a name and a
// playing position only: nothing a stranger could use to find a child.

export type TeamMember = { athleteId: string; name: string; position: string | null }
export type MatchRow = { id: string; team_a_id: string; team_b_id: string; status: string }
export type PerformanceRow = { player_rank_id: string; goals?: number | null; assists?: number | null; mvp?: boolean | null }
export type RankLink = { id: string; player_id: string | null }
export type TeamStatRow = TeamMember & { matches: number | null; goals: number | null; assists: number | null; mvps: number | null }
export type TeamSheetRow = { no: number; name: string; position: string | null }

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)
const POSITION_ORDER = ['GK', 'DF', 'MF', 'FW']
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'th')

export function teamMatchIds(matches: MatchRow[], teamId: string): string[] {
  return matches.filter(match => match.status === 'confirmed' && (match.team_a_id === teamId || match.team_b_id === teamId)).map(match => match.id)
}

export function teamSeasonStats(roster: TeamMember[], performances: PerformanceRow[], ranks: RankLink[]): TeamStatRow[] {
  const athleteOfRank = new Map(ranks.filter(rank => rank.player_id).map(rank => [rank.id, rank.player_id as string]))
  const totals = new Map<string, { matches: number; goals: number; assists: number; mvps: number }>()
  for (const row of performances) {
    const athleteId = athleteOfRank.get(row.player_rank_id)
    if (!athleteId) continue
    const total = totals.get(athleteId) ?? { matches: 0, goals: 0, assists: 0, mvps: 0 }
    total.matches += 1
    total.goals += count(row.goals)
    total.assists += count(row.assists)
    total.mvps += row.mvp === true ? 1 : 0
    totals.set(athleteId, total)
  }
  return roster
    .map(member => {
      const total = totals.get(member.athleteId)
      return total ? { ...member, ...total } : { ...member, matches: null, goals: null, assists: null, mvps: null }
    })
    .sort((a, b) => (b.matches ?? -1) - (a.matches ?? -1) || (b.goals ?? -1) - (a.goals ?? -1) || byName(a, b))
}

export function teamSheet(roster: TeamMember[]): TeamSheetRow[] {
  const rank = (position: string | null) => {
    const at = POSITION_ORDER.indexOf(position ?? '')
    return at < 0 ? POSITION_ORDER.length : at
  }
  return [...roster]
    .sort((a, b) => rank(a.position) - rank(b.position) || byName(a, b))
    .map((member, index) => ({ no: index + 1, name: member.name, position: POSITION_ORDER.includes(member.position ?? '') ? member.position : null }))
}
