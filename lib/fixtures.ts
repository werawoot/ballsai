// Draws and fixture lists for a tournament: knockout, league (everyone plays everyone) and
// groups followed by a knockout, plus the league table. Pure functions of the team list,
// so an organizer's draw can be previewed, tested and stored without the database deciding
// anything. Team order is seed order: pass a shuffled list for a random draw.

export type Slot =
  | { kind: 'team'; teamId: string }
  | { kind: 'winner'; fixtureKey: string }
  | { kind: 'group'; group: string; position: number }

export type Fixture = {
  key: string
  stage: 'knockout' | 'league' | 'group'
  round: number
  group?: string
  home: Slot
  away: Slot
}

const assertTeams = (ids: string[]) => {
  if (ids.length < 2) throw new Error('AT_LEAST_TWO_TEAMS')
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_TEAM')
}
const slotId = (slot: Slot) => slot.kind === 'team' ? `team:${slot.teamId}` : slot.kind === 'winner' ? `winner:${slot.fixtureKey}` : `group:${slot.group}:${slot.position}`

// Seed positions down the bracket, so seed 1 and seed 2 can only meet in the final:
// 2 -> [1,2]; 4 -> [1,4,2,3]; 8 -> [1,8,4,5,2,7,3,6].
export function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2
    order = order.flatMap(seed => [seed, next + 1 - seed])
  }
  return order
}

// Single elimination. Slots are in seed order. When the field is not a power of two the
// top seeds get byes: they enter round 2 directly and no bye match is scheduled, so n
// entrants always make n - 1 matches.
export function knockoutFixtures(slots: Slot[], keyPrefix = 'KO'): Fixture[] {
  assertTeams(slots.map(slotId))
  let size = 2
  while (size < slots.length) size *= 2
  // Entrants of the current round, in bracket order; null is a bye.
  let entrants: (Slot | null)[] = bracketOrder(size).map(seed => slots[seed - 1] ?? null)
  const fixtures: Fixture[] = []
  for (let round = 1; entrants.length > 1; round += 1) {
    const next: (Slot | null)[] = []
    let match = 0
    for (let index = 0; index < entrants.length; index += 2) {
      const home = entrants[index]
      const away = entrants[index + 1]
      if (home && away) {
        match += 1
        const key = `${keyPrefix}-R${round}-M${match}`
        fixtures.push({ key, stage: 'knockout', round, home, away })
        next.push({ kind: 'winner', fixtureKey: key })
      } else {
        next.push(home ?? away)
      }
    }
    entrants = next
  }
  return fixtures
}

// Round robin by the circle method: position 0 stays put, the rest rotate, so every pair
// meets exactly once and nobody plays twice in a round. An odd field puts the bye in the
// fixed position, so every real team rotates alike. With the fixed seat alternating by
// round and the others by seat, each team's home and away counts differ by at most one
// (checked for 2 to 41 teams).
function roundRobin(teamIds: string[], stage: 'league' | 'group', keyPrefix: string, group?: string): Fixture[] {
  assertTeams(teamIds)
  const ring: (string | null)[] = teamIds.length % 2 === 0 ? [...teamIds] : [null, ...teamIds]
  const size = ring.length
  const fixtures: Fixture[] = []
  for (let round = 1; round < size; round += 1) {
    let match = 0
    for (let index = 0; index < size / 2; index += 1) {
      const first = ring[index]
      const second = ring[size - 1 - index]
      if (!first || !second) continue
      const flip = index === 0 ? round % 2 === 0 : index % 2 === 1
      const [home, away] = flip ? [second, first] : [first, second]
      match += 1
      fixtures.push({ key: `${keyPrefix}-R${round}-M${match}`, stage, round, ...(group ? { group } : {}), home: { kind: 'team', teamId: home }, away: { kind: 'team', teamId: away } })
    }
    ring.splice(1, 0, ring.pop()!)
  }
  return fixtures
}

export const leagueFixtures = (teamIds: string[]) => roundRobin(teamIds, 'league', 'L')

type GroupOptions = { groupCount: number; advancePerGroup: 1 | 2 | number }

// Teams are dealt into groups in a snake (A B B A A B …) so each group gets a spread of
// seeds. Each group plays a league; the top one or two go on to a knockout in which a
// group winner meets the runner-up of the next group, never its own.
export function groupStageFixtures(teamIds: string[], { groupCount, advancePerGroup }: GroupOptions) {
  assertTeams(teamIds)
  if (groupCount < 2) throw new Error('AT_LEAST_TWO_GROUPS')
  if (advancePerGroup !== 1 && advancePerGroup !== 2) throw new Error('ADVANCE_ONE_OR_TWO')
  const labels = Array.from({ length: groupCount }, (_, index) => String.fromCharCode(65 + index))
  const groups: Record<string, string[]> = Object.fromEntries(labels.map(labelName => [labelName, []]))
  teamIds.forEach((id, index) => {
    const lap = Math.floor(index / groupCount)
    const position = index % groupCount
    groups[labels[lap % 2 === 0 ? position : groupCount - 1 - position]].push(id)
  })
  const smallest = Math.min(...labels.map(labelName => groups[labelName].length))
  if (smallest < Math.max(2, advancePerGroup + 1)) throw new Error('GROUP_TOO_SMALL')

  const fixtures: Fixture[] = labels.flatMap(labelName => roundRobin(groups[labelName], 'group', `G${labelName}`, labelName))
  const winners: Slot[] = labels.map(labelName => ({ kind: 'group', group: labelName, position: 1 }))
  let seeds: Slot[] = winners
  if (advancePerGroup === 2) {
    // Seed i (a winner) meets seed N+1-i in round one; put the next group's runner-up there.
    const count = groupCount * 2
    seeds = [...winners, ...Array<Slot>(groupCount)]
    labels.forEach((_, index) => {
      seeds[count - 1 - index] = { kind: 'group', group: labels[(index + 1) % groupCount], position: 2 }
    })
  }
  fixtures.push(...knockoutFixtures(seeds))
  return { groups, fixtures }
}

export type Result = { home: string; away: string; homeScore: number; awayScore: number }
export type StandingRow = { teamId: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }

// League table: 3 points a win, 1 a draw; ties broken by goal difference, then goals
// scored, then the order the teams were given in (stable). Results involving a team
// outside the table are ignored rather than half-counted.
export function standings(teamIds: string[], results: Result[]): StandingRow[] {
  const rows = new Map(teamIds.map(id => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]))
  for (const result of results) {
    const home = rows.get(result.home)
    const away = rows.get(result.away)
    if (!home || !away) continue
    for (const [row, scored, conceded] of [[home, result.homeScore, result.awayScore], [away, result.awayScore, result.homeScore]] as const) {
      row.played += 1
      row.goalsFor += scored
      row.goalsAgainst += conceded
      row.goalDifference = row.goalsFor - row.goalsAgainst
      if (scored > conceded) { row.won += 1; row.points += 3 } else if (scored === conceded) { row.drawn += 1; row.points += 1 } else row.lost += 1
    }
  }
  const order = new Map(teamIds.map((id, index) => [id, index]))
  return [...rows.values()].sort((a, b) =>
    b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || order.get(a.teamId)! - order.get(b.teamId)!)
}
