import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/monitoring', () => ({ logServerError: () => {}, logServerEvent: () => {} }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST as ask } from '@/app/api/organizer-requests/route'
import { POST as decide } from '@/app/api/admin/organizers/route'

const ID = '11111111-1111-4111-8111-111111111111'
const form = { orgName: ' สโมสรเยาวชนอยุธยา ', orgType: 'club', province: 'พระนครศรีอยุธยา', phone: '081-234-5678', note: 'U12' }
const post = (handler: (request: Request) => Promise<Response>, body: unknown) => handler(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: ID, error: null }) })

describe('/api/organizer-requests (ADR-013, sql/89)', () => {
  it('sends the five fields trimmed, with the phone as digits', async () => {
    expect((await post(ask, form)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('request_organizer_access', { p_org_name: 'สโมสรเยาวชนอยุธยา', p_org_type: 'club', p_province: 'พระนครศรีอยุธยา', p_phone: '0812345678', p_note: 'U12' })
  })

  it('names the wrong field before the database is asked', async () => {
    const response = await post(ask, { ...form, phone: '12' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'requestInvalid', field: 'phone' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words a second request and the 7-day wait', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'REQUEST_PENDING' } })
    expect(await (await post(ask, form)).json()).toMatchObject({ code: 'organizerRequestPending' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'REQUEST_TOO_SOON', details: '2026-11-03T10:00' } })
    expect(await (await post(ask, form)).json()).toMatchObject({ code: 'organizerRequestTooSoon', until: '2026-11-03T10:00' })
  })

  it('says the feature is not ready before sql/89 is applied', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect((await post(ask, form)).status).toBe(503)
  })
})

describe('/api/admin/organizers', () => {
  it('decides and revokes through the guarded functions', async () => {
    await post(decide, { action: 'decide', requestId: ID, approve: true })
    await post(decide, { action: 'decide', requestId: ID, approve: false, reason: ' ข้อมูลไม่พอ ' })
    await post(decide, { action: 'revoke', userId: ID, reason: 'ข้อมูลไม่ตรง' })
    expect(rpc.mock.calls).toEqual([
      ['decide_organizer_request', { p_request_id: ID, p_approve: true, p_reason: null }],
      ['decide_organizer_request', { p_request_id: ID, p_approve: false, p_reason: 'ข้อมูลไม่พอ' }],
      ['revoke_organizer_access', { p_user_id: ID, p_reason: 'ข้อมูลไม่ตรง' }],
    ])
  })

  it('refuses malformed input, and tells the second admin the request is decided', async () => {
    for (const body of [{ action: 'decide', requestId: 'x', approve: true }, { action: 'decide', requestId: ID }, { action: 'promote', userId: ID }]) {
      expect((await post(decide, body)).status).toBe(400)
    }
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'ALREADY_DECIDED' } })
    const response = await post(decide, { action: 'decide', requestId: ID, approve: false, reason: 'late' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'organizerRequestDecided' })
  })
})
