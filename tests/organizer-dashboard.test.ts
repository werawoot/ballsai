import { describe, expect, it } from 'vitest'
import { DASHBOARD_PAGE_SIZE, fetchOrganizerDashboard } from '@/lib/organizer-dashboard'

type Row = Record<string, unknown>
type Call = { table: string; filters: string[]; orders: string[]; inSizes: number[]; head: boolean; range?: [number, number] }

const get = (row: Row, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Row | undefined)?.[key], row)

// A stand-in for PostgREST: each table is already in the order the query asks for. It
// answers eq/in filters (also on an embedded table, "tournaments.organizer_id"), head
// counts and ranges, and records every call. Only the database boundary is faked.
function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, filters: [], orders: [], inSizes: [], head: false }
    calls.push(call)
    let rows = tables[table] ?? []
    const result = () => call.head
      ? { data: null, count: rows.length, error: null }
      : { data: call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows, count: null, error: null }
    const builder = {
      select: (_columns: string, options?: { count?: string; head?: boolean }) => { call.head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { call.filters.push(`${column}=${value}`); rows = rows.filter(row => get(row, column) === value); return builder },
      in: (column: string, values: unknown[]) => { call.inSizes.push(values.length); call.filters.push(`${column} in`); rows = rows.filter(row => values.includes(get(row, column))); return builder },
      order: (column: string, options?: { ascending?: boolean }) => { call.orders.push(`${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
      range: (start: number, end: number) => { call.range = [start, end]; return builder },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return builder
  }
  return { client: { from }, calls }
}

const ME = 'organizer-1'
const tournaments = (count: number, organizer = ME) => Array.from({ length: count }, (_, index) => ({ id: `${organizer}-t${index + 1}`, name: `Cup ${index + 1}`, organizer_id: organizer }))
const team = (id: string, tournament: { id: string; name: string; organizer_id: string }, status: string) =>
  ({ id, name: `Team ${id}`, status, tournament_id: tournament.id, tournaments: { name: tournament.name, organizer_id: tournament.organizer_id } })

describe('organizer dashboard, one page at a time', () => {
  it('pages the organizer\'s tournaments and says whether there are more', async () => {
    const mine = tournaments(25)
    const { client } = fakeSupabase({ tournaments: [...mine, ...tournaments(5, 'someone-else')] })
    const first = await fetchOrganizerDashboard(client as never, { organizerId: ME, tournamentsPage: 1, pendingPage: 1 })
    const last = await fetchOrganizerDashboard(client as never, { organizerId: ME, tournamentsPage: 3, pendingPage: 1 })
    expect(DASHBOARD_PAGE_SIZE).toBe(10)
    expect(first.tournaments.map(item => item.id)).toEqual(mine.slice(0, 10).map(item => item.id))
    expect(first.tournamentsHasNext).toBe(true)
    expect(last.tournaments.map(item => item.id)).toEqual(mine.slice(20).map(item => item.id))
    expect(last.tournamentsHasNext).toBe(false)
    expect(first.stats.tournaments).toBe(25)
  })

  it('orders every paged list with a unique tiebreak', async () => {
    const { client, calls } = fakeSupabase({ tournaments: tournaments(3) })
    await fetchOrganizerDashboard(client as never, { organizerId: ME, tournamentsPage: 1, pendingPage: 1 })
    for (const call of calls.filter(item => item.range)) expect(call.orders).toEqual(['created_at desc', 'id asc'])
  })

  // The old page sent every tournament id the organizer ever had in one .in(...) list and
  // loaded every team and payment. A few hundred tournaments make that URL too long, and
  // the rows grow without bound. Now no request names more ids than one page holds.
  it('never sends more ids than one page, however many tournaments and teams exist', async () => {
    const mine = tournaments(400)
    const teams = mine.flatMap((tournament, index) => [team(`p${index}`, tournament, 'pending'), team(`c${index}`, tournament, 'confirmed')])
    const { client, calls } = fakeSupabase({ tournaments: mine, teams, payments: [] })
    const dashboard = await fetchOrganizerDashboard(client as never, { organizerId: ME, tournamentsPage: 2, pendingPage: 3 })
    for (const call of calls) for (const size of call.inSizes) expect(size).toBeLessThanOrEqual(DASHBOARD_PAGE_SIZE)
    for (const call of calls.filter(item => !item.head)) expect(call.range ?? call.inSizes.length).toBeTruthy()
    expect(dashboard.stats).toEqual({ tournaments: 400, pending: 400, confirmed: 400 })
  })

  it('counts and queues only this organizer\'s teams, through the tournament', async () => {
    const mine = tournaments(2)
    const theirs = tournaments(1, 'someone-else')
    const teams = [team('a', mine[0], 'pending'), team('b', mine[1], 'confirmed'), team('x', theirs[0], 'pending')]
    const { client, calls } = fakeSupabase({ tournaments: [...mine, ...theirs], teams, payments: [{ id: 'pay-a', team_id: 'a', status: 'pending' }, { id: 'pay-x', team_id: 'x', status: 'pending' }] })
    const dashboard = await fetchOrganizerDashboard(client as never, { organizerId: ME, tournamentsPage: 1, pendingPage: 1 })
    expect(dashboard.stats).toEqual({ tournaments: 2, pending: 1, confirmed: 1 })
    expect(dashboard.pendingTeams.map(item => item.id)).toEqual(['a'])
    expect(dashboard.paymentsByTeam).toEqual({ a: expect.objectContaining({ id: 'pay-a' }) })
    expect(dashboard.teamCounts).toEqual({ [mine[0].id]: { total: 1, pending: 1 }, [mine[1].id]: { total: 1, pending: 0 } })
    const teamCalls = calls.filter(call => call.table === 'teams' && !call.filters.some(filter => filter.startsWith('tournament_id')))
    for (const call of teamCalls) expect(call.filters).toContain(`tournaments.organizer_id=${ME}`)
  })
})
