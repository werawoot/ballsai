import { beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// SQL102 (owner, 21 Nov 2026): a team's status moves only draft→pending→confirmed or →rejected,
// a paid team is confirmed only through its confirmed payment, and confirm_payment_safely confirms
// only a team that is waiting. The database refuses the rest; these routes turn each refusal into
// a code the organizer's page words, instead of a raw database message or a 400 "failed".

const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: { role: 'organizer' } as { role: string } | null,
  team: null as Record<string, unknown> | null,
  payment: null as Record<string, unknown> | null,
  update: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: boundary.getUser },
    rpc: boundary.rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.single = async () => table === 'profiles' ? { data: boundary.profile, error: null }
        : table === 'teams' ? { data: boundary.team, error: boundary.team ? null : { message: 'none' } }
        : { data: boundary.payment, error: boundary.payment ? null : { message: 'none' } }
      chain.update = (values: unknown) => ({ eq: async () => boundary.update(values) })
      return chain
    },
  }),
}))
vi.mock('@/lib/email', () => ({ sendTeamStatusEmail: async () => ({ sent: false, reason: 'test' }) }))
vi.mock('@/lib/monitoring', () => ({ logServerError: () => {} }))

import { POST as setStatus } from '@/app/api/teams/[teamId]/status/route'
import { POST as confirmPayment } from '@/app/api/payments/[paymentId]/confirm/route'

const TEAM = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const PAYMENT = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const postStatus = (status: string) => setStatus(new Request(`http://localhost/api/teams/${TEAM}/status`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
}), { params: Promise.resolve({ teamId: TEAM }) })
const postConfirm = () => confirmPayment(new Request(`http://localhost/api/payments/${PAYMENT}/confirm`, { method: 'POST' }), { params: Promise.resolve({ paymentId: PAYMENT }) })

beforeEach(() => {
  boundary.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'organizer-1' } } })
  boundary.profile = { role: 'organizer' }
  boundary.team = { id: TEAM, name: 'Team', created_by: 'coach-1', tournaments: { name: 'Cup', organizer_id: 'organizer-1' }, profiles: { email: null } }
  boundary.payment = { id: PAYMENT, team_id: TEAM, tournament_id: 't1', status: 'pending', tournaments: { organizer_id: 'organizer-1' } }
  boundary.update.mockReset().mockReturnValue({ error: null })
  boundary.rpc.mockReset().mockResolvedValue({ error: null })
})

describe('POST /api/teams/[teamId]/status under the SQL102 rules', () => {
  it('confirms a waiting free team', async () => {
    const response = await postStatus('confirmed')
    expect(response.status).toBe(200)
    expect(boundary.update).toHaveBeenCalledWith({ status: 'confirmed' })
  })

  it.each([
    ['TEAM_PAYMENT_REQUIRED', 'teamPaymentRequired'],
    ['TEAM_STATUS_TRANSITION', 'teamStatusLocked'],
  ])('answers 409 %s with the code %s, never the database text', async (raised, code) => {
    boundary.update.mockReturnValue({ error: { code: 'P0001', message: raised } })
    const response = await postStatus('confirmed')
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe(code)
    expect(body.error).toBe(th.apiErrors[code as keyof typeof th.apiErrors])
    expect(JSON.stringify(body)).not.toContain(raised)
  })

  it('does not hand another database error to the page as it is', async () => {
    boundary.update.mockReturnValue({ error: { code: '42501', message: 'new row violates row-level security policy for table "teams"' } })
    const response = await postStatus('rejected')
    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).not.toContain('row-level security')
  })
})

describe('POST /api/payments/[paymentId]/confirm under the SQL102 rules', () => {
  it('confirms through confirm_payment_safely', async () => {
    const response = await postConfirm()
    expect(boundary.rpc).toHaveBeenCalledWith('confirm_payment_safely', { p_payment_id: PAYMENT })
    expect(response.status).toBe(200)
  })

  it('says the team is no longer waiting when confirm_payment_safely refuses with TEAM_NOT_PENDING', async () => {
    boundary.rpc.mockResolvedValue({ error: { code: 'P0001', message: 'TEAM_NOT_PENDING' } })
    const response = await postConfirm()
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('teamStatusLocked')
  })
})

describe('the words for these codes', () => {
  it.each(['teamPaymentRequired', 'teamStatusLocked'])('%s has Thai and English text', code => {
    expect(th.apiErrors[code as keyof typeof th.apiErrors]).toBeTruthy()
    expect(en.apiErrors[code as keyof typeof en.apiErrors]).toBeTruthy()
  })
})
