import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/match-minutes/route'

const MATCH = '33333333-3333-4333-8333-333333333333'
const TEAM = '22222222-2222-4222-8222-222222222222'
const A = '11111111-1111-4111-8111-111111111111'
const call = (body: unknown) => POST(new Request('http://localhost/api/match-minutes', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 1, error: null }) })

// Minutes played (sql/74): the route checks the sheet like the database does.
describe('/api/match-minutes (sql/74)', () => {
  it('saves the cleaned sheet', async () => {
    expect((await call({ action: 'save', data: { matchId: MATCH, teamId: TEAM, length: 50, entries: [{ athleteId: A, started: true, off: 35 }] } })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('save_match_minutes', { p_match_id: MATCH, p_team_id: TEAM, p_length: 50, p_entries: [{ athleteId: A, started: true, on: null, off: 35 }] })
  })

  it('refuses a malformed sheet before the database is asked', async () => {
    for (const body of [
      { action: 'save', data: { matchId: MATCH, teamId: TEAM, length: 50, entries: [{ athleteId: A, started: false }] } },
      { action: 'save', data: { matchId: MATCH, teamId: TEAM, length: 10, entries: [] } },
      { action: 'save', data: { matchId: 'x', teamId: TEAM, length: 50, entries: [] } },
      { action: 'delete', data: {} },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words database refusals as codes', async () => {
    const body = { action: 'save', data: { matchId: MATCH, teamId: TEAM, length: 50, entries: [] } }
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect((await call(body)).status).toBe(503)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } })
    expect((await call(body)).status).toBe(403)
  })
})
