import { describe, expect, it } from 'vitest'
import {
  ID_BATCH_SIZE, RESULT_HISTORY_LIMIT, RESULT_TOURNAMENTS_PAGE_SIZE,
  fetchResultTournamentData, fetchResultTournamentsPage,
} from '@/lib/match-results-dashboard'

type Row = Record<string, unknown>
type Call = { table: string; filters: string[]; orders: string[]; inSizes: number[]; limit?: number; range?: [number, number] }

// A stand-in for PostgREST: tables already in the order asked for; eq/in/ilike filters,
// ranges, limits and single-row reads answered as the database would, every call recorded.
function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, filters: [], orders: [], inSizes: [] }
    calls.push(call)
    let rows = tables[table] ?? []
    const result = () => {
      let data = rows
      if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
      if (call.limit !== undefined) data = data.slice(0, call.limit)
      return { data, error: null }
    }
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { call.filters.push(`${column}=${value}`); rows = rows.filter(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { call.inSizes.push(values.length); rows = rows.filter(row => values.includes(row[column])); return builder },
      ilike: (column: string, value: string) => { call.filters.push(`${column}~${value}`); const needle = value.replace(/%/g, '').toLowerCase(); rows = rows.filter(row => String(row[column]).toLowerCase().includes(needle)); return builder },
      order: (column: string, options?: { ascending?: boolean }) => { call.orders.push(`${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
      range: (start: number, end: number) => { call.range = [start, end]; return builder },
      limit: (count: number) => { call.limit = count; return builder },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return builder
  }
  return { client: { from }, calls }
}

const ME = 'org-1'
const tournaments = (count: number, organizer = ME) => Array.from({ length: count }, (_, index) => ({ id: `${organizer}-t${index + 1}`, name: `${organizer} Cup ${index + 1}`, organizer_id: organizer }))

describe('choosing the tournament to record a result for', () => {
  it('pages an organizer\'s own tournaments, newest first with a unique tiebreak', async () => {
    const { client, calls } = fakeSupabase({ tournaments: [...tournaments(23), ...tournaments(4, 'org-2')] })
    const first = await fetchResultTournamentsPage(client as never, { userId: ME, isAdmin: false, page: 1 })
    const last = await fetchResultTournamentsPage(client as never, { userId: ME, isAdmin: false, page: 3 })
    expect(RESULT_TOURNAMENTS_PAGE_SIZE).toBe(10)
    expect(first.tournaments).toHaveLength(10)
    expect(first.hasNext).toBe(true)
    expect(last.tournaments.map(item => item.id)).toEqual(tournaments(23).slice(20).map(item => item.id))
    expect(last.hasNext).toBe(false)
    expect(calls[0].filters).toContain(`organizer_id=${ME}`)
    expect(calls[0].orders).toEqual(['created_at desc', 'id asc'])
  })

  it('lets an admin page and search every tournament in the country', async () => {
    const { client, calls } = fakeSupabase({ tournaments: [...tournaments(3), ...tournaments(3, 'org-2')] })
    const all = await fetchResultTournamentsPage(client as never, { userId: 'admin', isAdmin: true, page: 1 })
    expect(all.tournaments).toHaveLength(6)
    const found = await fetchResultTournamentsPage(client as never, { userId: 'admin', isAdmin: true, page: 1, search: 'org-2 Cup 2' })
    expect(found.tournaments.map(item => item.id)).toEqual(['org-2-t2'])
    expect(calls.every(call => !call.filters.some(filter => filter.startsWith('organizer_id')))).toBe(true)
  })
})

describe('the chosen tournament\'s teams, rosters and history', () => {
  // 64 confirmed teams of 20 accepted athletes each: 1,280 athletes. The old page sent them
  // all in one .in() list, far past what a request URL can carry.
  const tournament = { id: 'big', name: 'Big Cup', organizer_id: ME }
  const teams = Array.from({ length: 64 }, (_, index) => ({ id: `team-${index}`, name: `Team ${index}`, tournament_id: 'big', status: index < 60 ? 'confirmed' : 'pending' }))
  const members = teams.flatMap(team => Array.from({ length: 20 }, (_, index) => ({ team_id: team.id, athlete_id: `${team.id}-a${index}`, status: 'accepted' })))
  const ranks = members.map(member => ({ id: `rank-${member.athlete_id}`, player_id: member.athlete_id, player_name: member.athlete_id, position: 'MF', pts: 1000, sport: 'football', season: '2026' }))
  const results = Array.from({ length: 30 }, (_, index) => ({ id: `r${index}`, tournament_id: 'big' }))
  const tables = { tournaments: [tournament, ...tournaments(2, 'org-2')], teams, team_members: members, player_ranks: ranks, match_results: [...results, { id: 'other', tournament_id: 'org-2-t1' }] }
  const options = { tournamentId: 'big', userId: ME, isAdmin: false, sport: 'football', season: '2026' }

  it('loads every rostered athlete of a large tournament without an oversized request', async () => {
    const { client, calls } = fakeSupabase(tables)
    const data = await fetchResultTournamentData(client as never, options)
    for (const call of calls) for (const size of call.inSizes) expect(size).toBeLessThanOrEqual(ID_BATCH_SIZE)
    expect(ID_BATCH_SIZE).toBe(100)
    expect(data?.rosterPlayers).toHaveLength(60 * 20)
    expect(data?.confirmedTeams).toHaveLength(60)
    expect(data?.teams).toHaveLength(64)
    expect(new Set(data?.rosterPlayers.map(player => player.teamId)).size).toBe(60)
  })

  it('reads this tournament\'s latest results only, a fixed number of them', async () => {
    const { client, calls } = fakeSupabase(tables)
    const data = await fetchResultTournamentData(client as never, options)
    const history = calls.find(call => call.table === 'match_results')!
    expect(history.filters).toContain('tournament_id=big')
    expect(history.orders).toEqual(['created_at desc', 'id asc'])
    expect(history.limit).toBe(RESULT_HISTORY_LIMIT)
    expect(data?.matchResults).toHaveLength(RESULT_HISTORY_LIMIT)
  })

  it('refuses another organizer\'s tournament, but lets an admin open it', async () => {
    const { client } = fakeSupabase(tables)
    expect(await fetchResultTournamentData(client as never, { ...options, tournamentId: 'org-2-t1' })).toBeNull()
    expect(await fetchResultTournamentData(client as never, { ...options, tournamentId: 'missing' })).toBeNull()
    const asAdmin = await fetchResultTournamentData(client as never, { ...options, tournamentId: 'org-2-t1', userId: 'admin', isAdmin: true })
    expect(asAdmin?.tournament.id).toBe('org-2-t1')
    expect(asAdmin?.matchResults.map(result => result.id)).toEqual(['other'])
  })
})
