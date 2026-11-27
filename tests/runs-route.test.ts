import { beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// POST /api/runs (running mode V1, sql/108): add, remove and goal, for the signed-in account only.
// The database decides (RLS and the add_my_run checks); the route checks the form the same way
// first and words every refusal as a code (ADR-009).

const boundary = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  rpc: vi.fn(),
  remove: vi.fn(),
  allowed: true,
}))
vi.mock('@/lib/rate-limit', () => ({
  checkAddressRateLimit: async () => ({ allowed: boundary.allowed, retryAfterSeconds: 30 }),
  checkUserRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: boundary.user } }) },
    rpc: boundary.rpc,
    from: () => ({ delete: () => ({ eq: (_c: string, id: string) => ({ eq: () => ({ select: async () => boundary.remove(id) }) }) }) }),
  }),
}))

import { POST } from '@/app/api/runs/route'

const REQUEST = '7d0c4f1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f'
const post = (body: unknown) => POST(new Request('http://localhost/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())

beforeEach(() => {
  boundary.user = { id: 'u1' }
  boundary.allowed = true
  boundary.rpc.mockReset().mockResolvedValue({ data: 'run-1', error: null })
  boundary.remove.mockReset().mockResolvedValue({ data: [{ id: 'x' }], error: null })
})

describe('POST /api/runs', () => {
  it('adds a run through add_my_run with metres, seconds and the request id', async () => {
    const response = await post({ action: 'add', requestId: REQUEST, date: today(), km: '5', minutes: '30', seconds: '0' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, id: 'run-1' })
    expect(boundary.rpc).toHaveBeenCalledWith('add_my_run', { p_request_id: REQUEST, p_run_date: today(), p_distance_m: 5000, p_duration_s: 1800 })
  })

  it('refuses a form the database would refuse, before calling it', async () => {
    const response = await post({ action: 'add', requestId: REQUEST, date: today(), km: '10', minutes: '20', seconds: '0' })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('runTooFast')
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('needs a request id so a retried save is one run', async () => {
    const response = await post({ action: 'add', date: today(), km: '5', minutes: '30', seconds: '0' })
    expect(response.status).toBe(400)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['RUN_DAY_LIMIT', 'runDayLimit', 409],
    ['RUN_DATE_INVALID', 'runDate', 400],
    ['RUN_INVALID', 'runInvalid', 400],
  ])('answers %s with %s', async (raised, code, status) => {
    boundary.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: raised } })
    const response = await post({ action: 'add', requestId: REQUEST, date: today(), km: '5', minutes: '30', seconds: '0' })
    expect(response.status).toBe(status)
    const body = await response.json()
    expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toContain(raised)
  })

  it('answers 503 featureNotReady before sql/108', async () => {
    boundary.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    const response = await post({ action: 'add', requestId: REQUEST, date: today(), km: '5', minutes: '30', seconds: '0' })
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('featureNotReady')
  })

  it('sets the weekly goal through set_my_run_goal, and refuses a silly one', async () => {
    expect((await post({ action: 'goal', unit: 'km', target: 15 })).status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('set_my_run_goal', { p_unit: 'km', p_target: 15 })
    const refused = await post({ action: 'goal', unit: 'km', target: 301 })
    expect(refused.status).toBe(400)
    expect((await refused.json()).code).toBe('runGoalInvalid')
  })

  it('removes one of the account\'s own runs (RLS keeps it to its own)', async () => {
    const response = await post({ action: 'remove', id: REQUEST })
    expect(response.status).toBe(200)
    expect(boundary.remove).toHaveBeenCalledWith(REQUEST)
  })

  it('says so when there was no such run of this account to remove', async () => {
    boundary.remove.mockResolvedValue({ data: [], error: null })
    const response = await post({ action: 'remove', id: REQUEST })
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('runNotFound')
  })

  it('asks a signed-out person to sign in, and slows a flood', async () => {
    boundary.user = null
    expect((await post({ action: 'goal', unit: 'runs', target: 3 })).status).toBe(401)
    boundary.user = { id: 'u1' }
    boundary.allowed = false
    expect((await post({ action: 'goal', unit: 'runs', target: 3 })).status).toBe(429)
  })

  it.each(['runDate', 'runFuture', 'runDistance', 'runDuration', 'runTooFast', 'runInvalid', 'runDayLimit', 'runGoalInvalid'])('%s has Thai and English text', code => {
    expect(th.apiErrors[code as keyof typeof th.apiErrors]).toBeTruthy()
    expect(en.apiErrors[code as keyof typeof en.apiErrors]).toBeTruthy()
  })
})
