import { beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import { approvalAction, pickTeamPayments } from '@/lib/team-approval'

// SQL105 (owner, 25 Nov 2026): "ปฏิเสธแล้วจบ โค้ชส่งสลิปใหม่ได้", with a short reason, and the old
// slip kept as evidence. The organizer rejects a waiting slip; the team keeps waiting; the coach
// sends a new slip; a rejected slip is never confirmed later. The database decides; these routes
// turn each refusal into a code the page words.

const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: { role: 'organizer' } as { role: string } | null,
  payment: null as Record<string, unknown> | null,
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
        : { data: boundary.payment, error: boundary.payment ? null : { message: 'none' } }
      return chain
    },
  }),
}))
vi.mock('@/lib/monitoring', () => ({ logServerError: () => {} }))

import { POST as rejectPayment } from '@/app/api/payments/[paymentId]/reject/route'
import { POST as confirmPayment } from '@/app/api/payments/[paymentId]/confirm/route'

const PAYMENT = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const postReject = (body: unknown) => rejectPayment(new Request(`http://localhost/api/payments/${PAYMENT}/reject`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ paymentId: PAYMENT }) })
const postConfirm = () => confirmPayment(new Request(`http://localhost/api/payments/${PAYMENT}/confirm`, { method: 'POST' }), { params: Promise.resolve({ paymentId: PAYMENT }) })

beforeEach(() => {
  boundary.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'organizer-1' } } })
  boundary.profile = { role: 'organizer' }
  boundary.payment = { id: PAYMENT, team_id: 'team-1', tournament_id: 't1', status: 'pending', tournaments: { organizer_id: 'organizer-1' } }
  boundary.rpc.mockReset().mockResolvedValue({ error: null })
})

describe('POST /api/payments/[paymentId]/reject', () => {
  it('rejects with the trimmed reason through reject_payment_safely', async () => {
    const response = await postReject({ reason: '  ยอดไม่ครบ  ' })
    expect(response.status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('reject_payment_safely', { p_payment_id: PAYMENT, p_reason: 'ยอดไม่ครบ' })
  })

  it.each([[{}], [{ reason: '   ' }], [{ reason: 'ก'.repeat(201) }], [{ reason: 5 }]])('asks for a short reason before calling the database (%j)', async body => {
    const response = await postReject(body)
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('paymentRejectReasonRequired')
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('asks a signed-out person to sign in', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })
    const response = await postReject({ reason: 'ยอดไม่ครบ' })
    expect(response.status).toBe(401)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('refuses a coach and an organizer of another tournament', async () => {
    boundary.profile = { role: 'player' }
    expect((await postReject({ reason: 'ยอดไม่ครบ' })).status).toBe(403)
    boundary.profile = { role: 'organizer' }
    boundary.payment = { ...boundary.payment, tournaments: { organizer_id: 'someone-else' } }
    const response = await postReject({ reason: 'ยอดไม่ครบ' })
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('paymentForbidden')
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('answers a payment it cannot see with 404', async () => {
    boundary.payment = null
    const response = await postReject({ reason: 'ยอดไม่ครบ' })
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('paymentNotFound')
  })

  it.each([
    ['PAYMENT_NOT_PENDING', 'paymentNotPending', 409],
    ['TEAM_NOT_PENDING', 'teamStatusLocked', 409],
    ['REJECTION_REASON_REQUIRED', 'paymentRejectReasonRequired', 400],
    ['FORBIDDEN', 'paymentForbidden', 403],
    ['PAYMENT_NOT_FOUND', 'paymentNotFound', 404],
    ['new row violates row-level security policy', 'paymentRejectFailed', 400],
  ])('answers %s with the code %s, never the database text', async (raised, code, status) => {
    boundary.rpc.mockResolvedValue({ error: { code: 'P0001', message: raised } })
    const response = await postReject({ reason: 'ยอดไม่ครบ' })
    expect(response.status).toBe(status)
    const body = await response.json()
    expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toContain(raised)
  })
})

describe('before SQL105 is applied', () => {
  it('answers 503 featureNotReady when reject_payment_safely does not exist yet', async () => {
    boundary.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Could not find the function public.reject_payment_safely' } })
    const response = await postReject({ reason: 'ยอดไม่ครบ' })
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('featureNotReady')
  })
})

describe('POST /api/payments/[paymentId]/confirm after SQL105', () => {
  it('answers an open payment already on the team (unique index) with 409 paymentExists', async () => {
    boundary.rpc.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "payments_one_open_payment_per_team_idx"' } })
    const response = await postConfirm()
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('paymentExists')
  })

  it('answers a rejected slip with 409 paymentRejected', async () => {
    boundary.rpc.mockResolvedValue({ error: { code: 'P0001', message: 'PAYMENT_REJECTED' } })
    const response = await postConfirm()
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('paymentRejected')
  })
})

describe('the payment the organizer sees for a team', () => {
  const row = (id: string, status: string, created_at: string) => ({ id, team_id: 'team-1', status, created_at, amount: 500, slip_url: `${id}.png` })

  it('shows the open payment over earlier rejected ones, in any order', () => {
    const picked = pickTeamPayments([row('new', 'pending', '2026-11-25T02:00:00Z'), row('old', 'rejected', '2026-11-25T01:00:00Z')])
    expect(picked['team-1'].id).toBe('new')
    expect(pickTeamPayments([row('old', 'rejected', '2026-11-25T01:00:00Z'), row('new', 'pending', '2026-11-25T02:00:00Z')])['team-1'].id).toBe('new')
  })

  it('shows the latest rejected payment when the coach has not sent a new slip, and waits for one', () => {
    const picked = pickTeamPayments([row('first', 'rejected', '2026-11-25T01:00:00Z'), row('second', 'rejected', '2026-11-25T03:00:00Z')])
    expect(picked['team-1'].id).toBe('second')
    expect(approvalAction(500, picked['team-1'])).toBe('waitSlip')
  })
})

describe('words for the SQL105 codes', () => {
  it.each(['paymentNotFound', 'paymentForbidden', 'paymentRejectReasonRequired', 'paymentNotPending', 'paymentRejected', 'paymentRejectFailed'])('%s has Thai and English text', code => {
    expect(th.apiErrors[code as keyof typeof th.apiErrors]).toBeTruthy()
    expect(en.apiErrors[code as keyof typeof en.apiErrors]).toBeTruthy()
  })
})
