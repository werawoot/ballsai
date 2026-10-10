import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/team-staff/route'

const ID = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const call = (body: unknown) => POST(new Request('http://localhost/api/team-staff', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: ID, error: null }) })

// Assistant coaches (sql/75): the head coach invites by email, the person answers, the head
// coach removes or the assistant leaves. Who may is decided in the database.
describe('/api/team-staff (sql/75)', () => {
  it('invites with the email trimmed and lower-cased', async () => {
    expect((await call({ action: 'invite', data: { teamId: TEAM, email: '  Coach.B@Example.COM ' } })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('invite_team_staff', { p_team_id: TEAM, p_email: 'coach.b@example.com' })
  })

  it('forwards an answer with the 18-or-over confirmation, and a removal', async () => {
    await call({ action: 'respond', data: { id: ID, accept: true, adult: true } })
    await call({ action: 'respond', data: { id: ID, accept: false } })
    await call({ action: 'remove', data: { id: ID } })
    expect(rpc.mock.calls).toEqual([
      ['respond_team_staff', { p_staff_id: ID, p_accept: true, p_adult: true }],
      ['respond_team_staff', { p_staff_id: ID, p_accept: false, p_adult: false }],
      ['remove_team_staff', { p_staff_id: ID }],
    ])
  })

  it('refuses a bad email, an acceptance without the 18+ confirmation, bad ids and unknown actions without asking the database', async () => {
    const email = await call({ action: 'invite', data: { teamId: TEAM, email: 'not-an-email' } })
    expect(email.status).toBe(400)
    expect((await email.json()).code).toBe('staffEmailInvalid')
    const adult = await call({ action: 'respond', data: { id: ID, accept: true } })
    expect(adult.status).toBe(400)
    expect((await adult.json()).code).toBe('staffAdultRequired')
    for (const body of [
      { action: 'invite', data: { teamId: 'x', email: 'a@b.th' } },
      { action: 'respond', data: { id: 'x', accept: false } },
      { action: 'respond', data: { id: ID, accept: 'yes' } },
      { action: 'remove', data: { id: 'x' } },
      { action: 'promote', data: { id: ID } },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words each database refusal as its own code', async () => {
    const cases: [string, string, number, string][] = [
      ['P0002', 'USER_NOT_FOUND', 404, 'staffAccountNotFound'],
      ['22023', 'TOO_MANY_STAFF', 409, 'staffTooMany'],
      ['22023', 'STAFF_IS_MEMBER', 409, 'staffIsMember'],
      ['22023', 'STAFF_UNDER_18', 400, 'staffUnder18'],
      ['22023', 'CANNOT_INVITE_SELF', 400, 'staffInviteSelf'],
      ['22023', 'INVALID_EMAIL', 400, 'staffEmailInvalid'],
      ['55000', 'STAFF_INVITE_CLOSED', 409, 'staffInviteClosed'],
      ['22023', 'ADULT_REQUIRED', 400, 'staffAdultRequired'],
      ['42501', 'NOT_ALLOWED', 403, 'notAllowed'],
      ['PGRST202', 'missing', 503, 'featureNotReady'],
    ]
    for (const [code, message, status, apiCode] of cases) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message } })
      const response = await call({ action: 'invite', data: { teamId: TEAM, email: 'a@b.th' } })
      expect([message, response.status, (await response.json()).code]).toEqual([message, status, apiCode])
    }
  })
})
