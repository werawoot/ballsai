import { describe, expect, it } from 'vitest'
import { MAX_TEAMS, parseDrawRequest, saveTournamentDraw, fetchTournamentFixtures } from '@/lib/fixture-draw'

type Row = Record<string, unknown>
// A stand-in for PostgREST and the SQL55 function: teams filtered and ranged as asked,
// the RPC answering with whatever error or count the case sets up.
function fakeSupabase({ teams = [] as Row[], fixtures = [] as Row[], rpc = { data: 0 as unknown, error: null as null | { code?: string; message: string } } } = {}) {
  const calls: { table: string; filters: string[]; range?: [number, number]; limit?: number }[] = []
  const rpcCalls: { name: string; args: { p_tournament_id: string; p_fixtures: Row[] } }[] = []
  const from = (table: string) => {
    const call = { table, filters: [] as string[] } as (typeof calls)[number]
    calls.push(call)
    let rows = table === 'teams' ? teams : table === 'tournament_fixtures' ? fixtures : []
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { call.filters.push(`${column}=${value}`); rows = rows.filter(row => row[column] === undefined || row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { call.filters.push(`${column} in ${values.length}`); rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      limit: (count: number) => { call.limit = count; return builder },
      range: (start: number, end: number) => { call.range = [start, end]; return builder },
      then: (resolve: (value: unknown) => unknown) => {
        let data = rows
        if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
        if (call.limit !== undefined) data = data.slice(0, call.limit)
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return builder
  }
  const client = { from, rpc: async (name: string, args: (typeof rpcCalls)[number]['args']) => { rpcCalls.push({ name, args }); return rpc } }
  return { client, calls, rpcCalls }
}
const team = (index: number) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Team ${index}`, tournament_id: 'cup', status: 'confirmed' })
const confirmed = (count: number) => Array.from({ length: count }, (_, index) => team(index + 1))

describe('reading a draw request', () => {
  it('accepts the three formats and fills sensible defaults', () => {
    expect(parseDrawRequest({ format: 'knockout', order: 'random' })).toEqual({ format: 'knockout', order: 'random' })
    expect(parseDrawRequest({ format: 'groups', order: 'registration', groupCount: 4, advancePerGroup: 2 })).toEqual({ format: 'groups', order: 'registration', groupCount: 4, advancePerGroup: 2 })
    expect(parseDrawRequest({ format: 'league' })).toEqual({ format: 'league', order: 'registration' })
  })

  it.each([
    [null], [{}], [{ format: 'swiss' }], [{ format: 'groups' }], [{ format: 'groups', groupCount: 1 }],
    [{ format: 'groups', groupCount: 17 }], [{ format: 'groups', groupCount: 4, advancePerGroup: 3 }], [{ format: 'knockout', order: 'alphabet' }],
  ])('refuses %j', body => {
    expect(parseDrawRequest(body)).toEqual({ error: 'fixturesRequestInvalid' })
  })
})

describe('saving a draw', () => {
  it('draws only the tournament\'s confirmed teams and stores it through the checked function', async () => {
    const { client, calls, rpcCalls } = fakeSupabase({ teams: [...confirmed(6), { ...team(99), status: 'pending' }], rpc: { data: 5, error: null } })
    const result = await saveTournamentDraw(client as never, 'cup', { format: 'knockout', order: 'registration' })
    expect(result).toEqual({ ok: true, count: 5 })
    expect(calls[0].filters).toEqual(['tournament_id=cup', 'status=confirmed'])
    expect(calls[0].limit).toBe(MAX_TEAMS.knockout + 1)
    expect(rpcCalls[0].name).toBe('save_tournament_fixtures_safely')
    expect(rpcCalls[0].args.p_tournament_id).toBe('cup')
    expect(rpcCalls[0].args.p_fixtures).toHaveLength(5)
    expect(JSON.stringify(rpcCalls[0].args.p_fixtures)).not.toContain(team(99).id)
  })

  it('shuffles for a random draw, keeping every team exactly once', async () => {
    const first = fakeSupabase({ teams: confirmed(8), rpc: { data: 7, error: null } })
    const second = fakeSupabase({ teams: confirmed(8), rpc: { data: 7, error: null } })
    await saveTournamentDraw(first.client as never, 'cup', { format: 'knockout', order: 'registration' })
    let seed = 0.99
    await saveTournamentDraw(second.client as never, 'cup', { format: 'knockout', order: 'random' }, () => (seed = (seed * 9301 + 0.49297) % 1))
    const teamsOf = (rows: Row[]) => rows.flatMap(row => [row.home_team_id, row.away_team_id]).filter(Boolean)
    const ordered = teamsOf(first.rpcCalls[0].args.p_fixtures)
    const shuffled = teamsOf(second.rpcCalls[0].args.p_fixtures)
    expect([...shuffled].sort()).toEqual([...ordered].sort())
    expect(shuffled).not.toEqual(ordered)
  })

  it.each([
    [1, 'knockout', 'fixturesNeedTwoTeams', 400],
    [MAX_TEAMS.league + 1, 'league', 'fixturesTooManyTeams', 400],
  ] as const)('refuses %i teams for %s before calling the database', async (count, format, code, status) => {
    const { client, rpcCalls } = fakeSupabase({ teams: confirmed(count) })
    expect(await saveTournamentDraw(client as never, 'cup', { format, order: 'registration' })).toEqual({ ok: false, code, status })
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuses groups that cannot be played', async () => {
    const { client } = fakeSupabase({ teams: confirmed(5) })
    expect(await saveTournamentDraw(client as never, 'cup', { format: 'groups', order: 'registration', groupCount: 3, advancePerGroup: 2 })).toEqual({ ok: false, code: 'fixturesGroupsTooSmall', status: 400 })
  })

  it.each([
    [{ code: 'P0001', message: 'NOT_ALLOWED' }, 'fixturesNotAllowed', 403],
    [{ code: 'P0001', message: 'FIXTURES_HAVE_RESULTS' }, 'fixturesHaveResults', 409],
    [{ code: 'P0001', message: 'TEAM_NOT_CONFIRMED: 1234' }, 'fixturesTeamsChanged', 409],
    [{ code: 'PGRST202', message: 'Could not find the function public.save_tournament_fixtures_safely' }, 'fixturesMigrationMissing', 503],
    [{ code: 'XX000', message: 'boom' }, 'fixturesFailed', 500],
  ])('turns database error %j into %s', async (error, code, status) => {
    const { client } = fakeSupabase({ teams: confirmed(4), rpc: { data: null, error } })
    expect(await saveTournamentDraw(client as never, 'cup', { format: 'league', order: 'registration' })).toEqual({ ok: false, code, status })
  })
})

describe('reading a stored draw', () => {
  it('reads every fixture of a large league in pages, never silently cut at the API row limit', async () => {
    const fixtures = Array.from({ length: 2016 }, (_, index) => ({ fixture_key: `L-R1-M${index}`, tournament_id: 'cup' }))
    const { client, calls } = fakeSupabase({ fixtures })
    const result = await fetchTournamentFixtures(client as never, 'cup')
    expect(result.fixtures).toHaveLength(2016)
    const reads = calls.filter(call => call.table === 'tournament_fixtures')
    for (const read of reads) expect(read.range![1] - read.range![0] + 1).toBeLessThanOrEqual(1000)
  })
})
