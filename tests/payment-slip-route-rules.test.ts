import { beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// SQL104 (owner, 24 Nov 2026): a new payment names a slip its payer uploaded to the private bucket,
// for the tournament's fee. The slip route always uploads first and copies the fee, so the database
// refuses only a payment forged around it; if it ever refuses the route's own insert, the page gets
// a code it can word, never the database's text.

const boundary = vi.hoisted(() => ({
  insertError: null as null | { code?: string; message: string },
  uploadError: null as null | { message: string },
}))
vi.mock('@/lib/rate-limit', () => ({
  checkAddressRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
  checkUserRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}))
vi.mock('@/lib/monitoring', () => ({ logServerError: () => {}, logServerEvent: () => {} }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } } }) },
    storage: { from: () => ({ upload: async () => ({ error: boundary.uploadError }) }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.neq = () => chain
      chain.single = async () => ({ data: { id: 'team-1', tournament_id: 't-1', created_by: 'coach-1', status: 'pending', tournaments: { fee: 500, promptpay: '0812345678', status: 'open' } }, error: null })
      chain.maybeSingle = async () => ({ data: null, error: null })
      chain.insert = async () => ({ error: table === 'payments' ? boundary.insertError : null })
      return chain
    },
  }),
}))

import { POST } from '@/app/api/teams/[teamId]/payment/route'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const sendSlip = () => {
  const form = new FormData()
  form.append('slip', new File([PNG], 'slip.png', { type: 'image/png' }))
  return POST(new Request('http://localhost/api/teams/team-1/payment', { method: 'POST', body: form }), { params: Promise.resolve({ teamId: 'team-1' }) })
}

beforeEach(() => {
  boundary.insertError = null
  boundary.uploadError = null
})

describe('POST /api/teams/[teamId]/payment under the SQL104 rules', () => {
  it('stores the slip and the payment', async () => {
    const response = await sendSlip()
    expect(response.status).toBe(200)
  })

  it.each([
    ['SLIP_NOT_UPLOADED', 'paymentSlipNotUploaded'],
    ['PAYMENT_AMOUNT_MISMATCH', 'paymentAmountMismatch'],
    ['SLIP_REQUIRED', 'paymentSlipRequired'],
  ])('answers 409 %s with the code %s, never the database text', async (raised, code) => {
    boundary.insertError = { code: 'P0001', message: raised }
    const response = await sendSlip()
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toContain(raised)
  })

  it('does not hand another database error to the page as it is', async () => {
    boundary.insertError = { code: '42501', message: 'new row violates row-level security policy for table "payments"' }
    const response = await sendSlip()
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('paymentSaveFailed')
    expect(JSON.stringify(body)).not.toContain('row-level security')
  })

  it('answers a second payment for the same team (unique index) with 409 paymentExists', async () => {
    boundary.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "payments_one_payment_per_team_idx"' }
    const response = await sendSlip()
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe('paymentExists')
    expect(JSON.stringify(body)).not.toContain('duplicate key')
  })

  it('does not hand the Storage error to the page as it is', async () => {
    boundary.uploadError = { message: 'new row violates row-level security policy' }
    const response = await sendSlip()
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('paymentSlipUploadFailed')
    expect(JSON.stringify(body)).not.toContain('row-level security')
  })

  it.each(['paymentSlipNotUploaded', 'paymentAmountMismatch', 'paymentSaveFailed', 'paymentExists', 'paymentSlipUploadFailed'])('%s has Thai and English text', code => {
    expect(th.apiErrors[code as keyof typeof th.apiErrors]).toBeTruthy()
    expect(en.apiErrors[code as keyof typeof en.apiErrors]).toBeTruthy()
  })
})
