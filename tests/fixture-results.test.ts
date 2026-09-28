import { describe, expect, it } from 'vitest'
import { ID_BATCH, drawTables, fetchTournamentFixtures, saveFixtureWinner } from '@/lib/fixture-draw'

type Row = Record<string, unknown>
function fakeSupabase(tables: Record<string, Row[]>, rpc: { data: unknown; error: null | { code?: string; message: string } } = { data: null, error: null }) {
  const calls: { table: string; inSizes: number[] }[] = []
  const rpcCalls: { name: string; args: Row }[] = []
  const from = (table: string) => {
    const call = { table, inSizes: [] as number[] }
    calls.push(call)
    let rows = tables[table] ?? []
    let window: [number, number] | null = null
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === undefined || row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { call.inSizes.push(values.length); rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      limit: () => builder,
      range: (start: number, end: number) => { window = [start, end]; return builder },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null }).then(resolve),
    }
    return builder
  }
  return { client: { from, rpc: async (name: string, args: Row) => { rpcCalls.push({ name, args }); return rpc } }, calls, rpcCalls }
}

const fixture = (key: string, stage: string, home: string | null, away: string | null, extra: Row = {}) =>
  ({ tournament_id: 'cup', fixture_key: key, stage, round: 1, group_label: null, home_team_id: home, away_team_id: away, home_source: null, away_source: null, match_result_id: null, winner_team_id: null, ...extra })

describe('a draw with its results', () => {
  it('reads the scores of every linked result, in batches small enough for any request', async () => {
    const fixtures = Array.from({ length: 250 }, (_, index) => fixture(`L-R1-M${index}`, 'league', 'a', 'b', { match_result_id: `r${index}` }))
    const results = fixtures.map((_, index) => ({ id: `r${index}`, team_a_id: 'a', team_b_id: 'b', team_a_score: index % 3, team_b_score: 1, status: 'confirmed' }))
    const { client, calls } = fakeSupabase({ tournament_fixtures: fixtures, match_results: results, teams: [] })
    const stored = await fetchTournamentFixtures(client as never, 'cup')
    expect(Object.keys(stored.results)).toHaveLength(250)
    expect(stored.results.r4).toMatchObject({ team_a_score: 1, team_b_score: 1 })
    for (const call of calls) for (const size of call.inSizes) expect(size).toBeLessThanOrEqual(ID_BATCH)
  })

  // The table the page shows must rank exactly as sql/56 fills the knockout: points, goal
  // difference, goals, then registration order -- never the order teams happen to appear.
  it('ranks each group like the database does, ties by registration order, void results left out', () => {
    const group = { group_label: 'A' }
    const stored = {
      fixtures: [
        fixture('GA-R1-M1', 'group', 'late', 'early', { ...group, match_result_id: 'r1' }),
        fixture('GA-R1-M2', 'group', 'third', 'fourth', { ...group, match_result_id: 'r2' }),
        fixture('GA-R2-M1', 'group', 'late', 'third', { ...group, match_result_id: 'r3' }),
        fixture('L-R1-M1', 'league', 'x', 'y'),
      ],
      results: {
        r1: { id: 'r1', team_a_id: 'early', team_b_id: 'late', team_a_score: 1, team_b_score: 1, status: 'confirmed' },
        r2: { id: 'r2', team_a_id: 'third', team_b_id: 'fourth', team_a_score: 0, team_b_score: 0, status: 'confirmed' },
        r3: { id: 'r3', team_a_id: 'late', team_b_id: 'third', team_a_score: 9, team_b_score: 0, status: 'void' },
      },
      teamOrder: ['early', 'third', 'late', 'fourth', 'x', 'y'],
      teamNames: {}, migrationMissing: false, failed: false,
    }
    const tables = drawTables(stored as never)
    expect(tables.map(table => table.key)).toEqual(['group:A', 'league'])
    // early and late scored 1, third and fourth 0: goals first, then registration order.
    expect(tables[0].rows.map(row => [row.teamId, row.points, row.played])).toEqual([['early', 1, 1], ['late', 1, 1], ['third', 1, 1], ['fourth', 1, 1]])
  })
})

describe('choosing a knockout winner after a draw', () => {
  it('asks the checked function, and nothing else', async () => {
    const { client, rpcCalls } = fakeSupabase({})
    expect(await saveFixtureWinner(client as never, 'cup', 'KO-R1-M2', 'team-2')).toEqual({ ok: true })
    expect(rpcCalls).toEqual([{ name: 'set_fixture_winner_safely', args: { p_tournament_id: 'cup', p_fixture_key: 'KO-R1-M2', p_winner_team_id: 'team-2' } }])
  })

  it.each([
    ['NOT_ALLOWED', 'fixturesNotAllowed', 403],
    ['NOT_A_DRAWN_KNOCKOUT', 'fixtureWinnerInvalid', 400],
    ['WINNER_NOT_IN_MATCH', 'fixtureWinnerInvalid', 400],
    ['FIXTURE_ALREADY_ADVANCED', 'fixtureAlreadyAdvanced', 409],
    ['Could not find the function public.set_fixture_winner_safely', 'fixtureResultsMigrationMissing', 503],
    ['boom', 'fixturesFailed', 500],
  ])('turns %s into %s', async (message, code, status) => {
    const { client } = fakeSupabase({}, { data: null, error: { message } })
    expect(await saveFixtureWinner(client as never, 'cup', 'KO-R1-M2', 'team-2')).toEqual({ ok: false, code, status })
  })
})
