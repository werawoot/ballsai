import { beforeEach, describe, expect, it, vi } from 'vitest'

// The four accounts the product rule distinguishes. One person may hold several of
// these capabilities; each must stay scoped to its own resource.
const OWNER_ORGANIZER = 'organizer-owns-it'
const OTHER_ORGANIZER = 'organizer-owns-something-else'
const COACH_ONLY = 'coach-no-organizer-role'
const UNRELATED = 'unrelated-adult'
const TOURNAMENT = '11111111-1111-4111-8111-111111111111'

const db = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: vi.fn(),
  tournament: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: db.getUser },
    from: (table: string) => {
      db.from(table)
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self, eq: self, in: self, order: self, limit: self,
        maybeSingle: () => (table === 'profiles' ? db.profile() : db.tournament()),
        single: () => (table === 'profiles' ? db.profile() : db.tournament()),
      })
      return chain
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }))
vi.mock('@/lib/monitoring', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { POST } from '@/app/api/match-results/route'

const signedInAs = (id: string, role: 'user' | 'organizer' | 'admin') => {
  db.getUser.mockResolvedValue({ data: { user: { id } } })
  db.profile.mockResolvedValue({ data: { role }, error: null })
}

const recordResult = () =>
  POST(new Request('http://localhost/api/match-results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'confirm',
      tournamentId: TOURNAMENT,
      teamAId: '22222222-2222-4222-8222-222222222222',
      teamBId: '33333333-3333-4333-8333-333333333333',
      teamAScore: 2,
      teamBScore: 1,
      // A real performance entry is required: an empty list is rejected with 400
      // before the ownership check, which would make these assertions vacuous.
      performances: [{ playerRankId: '44444444-4444-4444-8444-444444444444', teamId: '22222222-2222-4222-8222-222222222222', goals: 1 }],
    }),
  }))

beforeEach(() => {
  vi.clearAllMocks()
  db.tournament.mockResolvedValue({ data: { id: TOURNAMENT, organizer_id: OWNER_ORGANIZER }, error: null })
})

describe('recording a match result stays with the tournament owner or an admin', () => {
  it('refuses an account that is not signed in', async () => {
    db.getUser.mockResolvedValue({ data: { user: null } })

    expect((await recordResult()).status).toBe(401)
  })

  it('refuses a coach-only account, whose persona grants no result recording', async () => {
    // A coach may run their own team's roster. That is not a tournament capability.
    signedInAs(COACH_ONLY, 'user')

    const response = await recordResult()

    expect(response.status).toBe(403)
    expect(db.from).not.toHaveBeenCalledWith('match_results')
  })

  it('refuses an unrelated adult account', async () => {
    signedInAs(UNRELATED, 'user')

    expect((await recordResult()).status).toBe(403)
  })

  it('refuses another organizer, who owns a different tournament', async () => {
    // The organizer role is real, but the resource is not theirs.
    signedInAs(OTHER_ORGANIZER, 'organizer')

    const response = await recordResult()

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('เฉพาะรายการแข่งของคุณ') })
  })

  it('lets the organizer who owns the tournament past the ownership gate', async () => {
    signedInAs(OWNER_ORGANIZER, 'organizer')

    const response = await recordResult()

    // Past the gate the handler goes on to load teams; the point here is that
    // authorization did not stop it and the tournament was actually read.
    expect([401, 403]).not.toContain(response.status)
    expect(db.from.mock.calls.map(call => call[0])).toContain('tournaments')
  })

  it('lets an admin past the ownership gate even for a tournament they do not own', async () => {
    signedInAs('admin-1', 'admin')

    const response = await recordResult()

    expect([401, 403]).not.toContain(response.status)
    expect(db.from.mock.calls.map(call => call[0])).toContain('tournaments')
  })

  it('checks the profile role before it ever loads the tournament', async () => {
    // Ordering matters: a denied account must not be able to probe which tournaments
    // exist through a difference in the response.
    signedInAs(COACH_ONLY, 'user')

    await recordResult()

    const tables = db.from.mock.calls.map(call => call[0])
    expect(tables[0]).toBe('profiles')
    expect(tables).not.toContain('tournaments')
  })
})
