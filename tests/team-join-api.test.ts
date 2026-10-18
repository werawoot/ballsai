import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/team-join/route'

const T = '11111111-1111-4111-8111-111111111111'
const R = '22222222-2222-4222-8222-222222222222'
const M = '33333333-3333-4333-8333-333333333333'
const TOKEN = '0123456789abcdef0123456789abcdef'
const call = (body: unknown) => POST(new Request('http://localhost/api/team-join', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 'ok', error: null }) })

// ADR-011, sql/83. Who may do what is decided in the database; the route checks shapes,
// calls one function per action and words each refusal.
describe('/api/team-join (sql/83)', () => {
  it('reads, renews and opens or closes a team link', async () => {
    await call({ action: 'link', data: { teamId: T } })
    await call({ action: 'rotate', data: { teamId: T } })
    await call({ action: 'open', data: { teamId: T, open: false } })
    expect(rpc.mock.calls).toEqual([
      ['my_team_join_link', { p_team_id: T }],
      ['update_team_join_link', { p_team_id: T, p_rotate: true, p_open: null }],
      ['update_team_join_link', { p_team_id: T, p_rotate: false, p_open: false }],
    ])
  })

  it('asks to join, decides, leaves and removes with a reason', async () => {
    await call({ action: 'request', data: { token: TOKEN } })
    await call({ action: 'decide', data: { requestId: R, accept: true } })
    await call({ action: 'leave', data: { memberId: M } })
    await call({ action: 'remove', data: { memberId: M, teamId: T, reason: 'other', note: '  ย้ายไปเรียนต่างจังหวัด  ' } })
    await call({ action: 'remove', data: { memberId: M, teamId: T, reason: 'inactive', note: 'ignored' } })
    expect(rpc.mock.calls).toEqual([
      ['request_to_join_team', { p_token: TOKEN }],
      ['decide_join_request', { p_request_id: R, p_accept: true }],
      ['leave_team', { p_member_id: M }],
      ['remove_team_member', { p_member_id: M, p_reason: 'other', p_note: 'ย้ายไปเรียนต่างจังหวัด' }],
      ['remove_team_member', { p_member_id: M, p_reason: 'inactive', p_note: null }],
    ])
  })

  it('refuses bad shapes without asking the database', async () => {
    for (const body of [
      { action: 'link', data: { teamId: 'x' } },
      { action: 'open', data: { teamId: T, open: 'no' } },
      { action: 'request', data: { token: 'not-a-token' } },
      { action: 'request', data: { token: TOKEN.toUpperCase() } },
      { action: 'decide', data: { requestId: R } },
      { action: 'leave', data: { memberId: 'x' } },
      { action: 'remove', data: { memberId: M, teamId: T, reason: 'rude' } },
      { action: 'remove', data: { memberId: M, teamId: T, reason: 'other', note: '   ' } },
      { action: 'remove', data: { memberId: M, teamId: T, reason: 'other', note: 'ก'.repeat(201) } },
      { action: 'nope', data: {} },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words each database refusal as its own code', async () => {
    const cases: [string, string, number, string][] = [
      ['22023', 'LINK_NOT_FOUND', 404, 'joinLinkNotFound'],
      ['55000', 'LINK_CLOSED', 409, 'joinLinkClosed'],
      ['22023', 'OWN_TEAM', 400, 'joinOwnTeam'],
      ['22023', 'ATHLETE_PROFILE_REQUIRED', 409, 'joinProfileRequired'],
      ['54000', 'TEAM_REQUESTS_FULL', 409, 'joinTeamFull'],
      ['54000', 'TOO_MANY_REQUESTS', 429, 'joinTooMany'],
      ['22023', 'NOT_CLUB_TEAM', 400, 'joinNotClubTeam'],
      ['55000', 'ROSTER_LOCKED', 409, 'teamRosterLocked'],
      ['23505', 'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER', 409, 'teamAthleteElsewhere'],
      ['22023', 'MEMBER_NOT_FOUND', 404, 'memberNotFound'],
      ['42501', 'NOT_ALLOWED', 403, 'notAllowed'],
      ['PGRST202', 'missing', 503, 'featureNotReady'],
    ]
    for (const [code, message, status, key] of cases) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message } })
      const response = await call({ action: 'leave', data: { memberId: M } })
      expect([response.status, (await response.json()).code]).toEqual([status, key])
    }
  })

  it('removes through the old function while sql/83 is not applied', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    rpc.mockResolvedValueOnce({ data: { status: 'removed' }, error: null })
    const response = await call({ action: 'remove', data: { memberId: M, teamId: T, reason: 'moved_team' } })
    expect(response.status).toBe(200)
    expect(rpc.mock.calls[1]).toEqual(['manage_coach_beta', { p_action: 'remove', p_id: T, p_data: { memberId: M } }])
  })
})
