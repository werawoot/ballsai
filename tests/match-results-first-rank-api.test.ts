import { beforeEach, describe, expect, it, vi } from 'vitest'

// T32: /api/match-results accepts an athlete who has no rank row yet (key new:<athlete>).
// The preview computes their rating from the starting point without writing anything;
// the confirm hands them to record_match_result_first_rank (sql/61) by athleteId, which
// creates the rank row together with the match.

const ORGANIZER = 'aaaaaaaa-0000-4000-8000-000000000001'
const TOURNAMENT = '11111111-1111-4111-8111-111111111111'
const TEAM_A = '22222222-2222-4222-8222-222222222222'
const TEAM_B = '33333333-3333-4333-8333-333333333333'
const RANKED = '44444444-4444-4444-8444-444444444444'
const FRESH = '55555555-5555-4555-8555-555555555555'
const PRIVATE = '66666666-6666-4666-8666-666666666666'
const STRANGER = '77777777-7777-4777-8777-777777777777'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, inserts: [] as { table: string; row: Row }[], rpc: vi.fn() }))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: ORGANIZER } } }) },
    from: (table: string) => {
      let rows = [...(db.tables[table] ?? [])]
      let inserted: Row | null = null
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return chain },
        in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return chain },
        insert: (row: Row) => { inserted = { id: 'rating-new', ...row }; db.inserts.push({ table, row }); return chain },
        single: async () => ({ data: inserted ?? rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return chain
    },
    rpc: db.rpc,
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }))
vi.mock('@/lib/monitoring', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { POST } from '@/app/api/match-results/route'

const send = (mode: 'preview' | 'confirm', performances: Row[]) =>
  POST(new Request('http://localhost/api/match-results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, requestId: '99999999-9999-4999-8999-999999999999', tournamentId: TOURNAMENT, teamAId: TEAM_A, teamBId: TEAM_B, teamAScore: 2, teamBScore: 1, performances }),
  }))

beforeEach(() => {
  db.inserts = []
  db.rpc.mockReset()
  db.tables = {
    profiles: [{ id: ORGANIZER, role: 'organizer' }],
    tournaments: [{ id: TOURNAMENT, organizer_id: ORGANIZER }],
    teams: [{ id: TEAM_A, name: 'A', tournament_id: TOURNAMENT, status: 'confirmed' }, { id: TEAM_B, name: 'B', tournament_id: TOURNAMENT, status: 'confirmed' }],
    player_ranks: [{ id: 'rank-1', player_id: RANKED, player_name: 'Ranked', sport: 'football', season: '2026', position: 'GK', pts: 1200 }],
    player_ratings: [{ id: 'rating-1', player_rank_id: 'rank-1', sport: 'football', season: '2026', power_rating: 1200, matches_played: 4 }],
    team_members: [
      { team_id: TEAM_A, athlete_id: RANKED, status: 'accepted' },
      { team_id: TEAM_A, athlete_id: FRESH, status: 'accepted' },
      { team_id: TEAM_B, athlete_id: PRIVATE, status: 'accepted' },
    ],
    athlete_profiles: [
      { user_id: FRESH, display_name: 'Fresh', position: 'fw', sport: 'football', is_public: true },
      { user_id: PRIVATE, display_name: 'Hidden', position: 'MF', sport: 'football', is_public: false },
    ],
  }
})

describe('an athlete\'s first verified match', () => {
  it('previews a new athlete from the starting rating and writes nothing', async () => {
    const response = await send('preview', [
      { playerRankId: 'rank-1', teamId: TEAM_A },
      { playerRankId: `new:${FRESH}`, teamId: TEAM_A, goals: 1 },
    ])
    expect(response.status).toBe(200)
    const body = await response.json()
    const fresh = body.preview.find((item: Row) => item.playerRankId === `new:${FRESH}`)
    expect(fresh).toMatchObject({ playerName: 'Fresh', ratingBefore: 1000, teamId: TEAM_A, result: 'win' })
    expect(fresh.ratingAfter).toBeGreaterThan(1000)
    expect(db.inserts).toEqual([])
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('refuses an athlete whose profile is not public, before any rating is computed', async () => {
    const response = await send('preview', [{ playerRankId: `new:${PRIVATE}`, teamId: TEAM_B }])
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/สาธารณะ/)
  })

  it('refuses a new athlete who is not on that team\'s accepted roster', async () => {
    db.tables.athlete_profiles.push({ user_id: STRANGER, display_name: 'Stranger', position: 'MF', sport: 'football', is_public: true })
    const response = await send('preview', [{ playerRankId: `new:${STRANGER}`, teamId: TEAM_A }])
    expect(response.status).toBe(400)
  })

  it('refuses a malformed new-athlete key', async () => {
    expect((await send('preview', [{ playerRankId: 'new:not-a-uuid', teamId: TEAM_A }])).status).toBe(400)
  })

  it('confirms through record_match_result_first_rank, sending the new athlete by athleteId', async () => {
    db.rpc.mockResolvedValue({ data: 'match-1', error: null })
    const response = await send('confirm', [
      { playerRankId: 'rank-1', teamId: TEAM_A },
      { playerRankId: `new:${FRESH}`, teamId: TEAM_A, goals: 1 },
    ])
    expect(response.status).toBe(200)
    const [name, params] = db.rpc.mock.calls[0]
    expect(name).toBe('record_match_result_first_rank')
    expect(params).toMatchObject({ p_sport: 'football', p_season: '2026', p_tournament_id: TOURNAMENT })
    const items = params.p_performances as Row[]
    expect(items.find(item => item.athleteId === FRESH)).toMatchObject({ teamId: TEAM_A, ratingBefore: 1000 })
    expect(items.find(item => item.athleteId === FRESH)).not.toHaveProperty('playerRankId')
    expect(items.find(item => item.playerRankId === 'rank-1')).toMatchObject({ ratingBefore: 1200 })
  })

  it('says SQL61 is missing instead of recording without the new athlete', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    const response = await send('confirm', [{ playerRankId: `new:${FRESH}`, teamId: TEAM_A }])
    expect(response.status).toBe(503)
  })
})
