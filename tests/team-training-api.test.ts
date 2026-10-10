import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/team-training/route'

const TEAM = '22222222-2222-4222-8222-222222222222'
const call = (body: unknown) => POST(new Request('http://localhost/api/team-training', { method: 'POST', body: JSON.stringify(body) }))
const days = [{ day: 1, title: ' บอลติดเท้า ', blocks: [{ drill: 'a1-react-jog', name: 'วิ่ง', minutes: 10, load: 1 }] }]

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 3, error: null }) })

// A team's weekly training plan (sql/72): the route checks the plan like the database does.
describe('/api/team-training (sql/72)', () => {
  it('saves the cleaned plan for a Monday and says how many were notified', async () => {
    const response = await call({ action: 'save', data: { teamId: TEAM, weekStart: '2026-10-12', days, notify: true } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, data: 3 })
    expect(rpc).toHaveBeenCalledWith('save_team_training_plan', {
      p_team_id: TEAM, p_week_start: '2026-10-12', p_notify: true,
      p_days: [{ day: 1, title: 'บอลติดเท้า', blocks: [{ drill: 'a1-react-jog', name: 'วิ่ง', minutes: 10, load: 1 }] }],
    })
  })

  it('refuses malformed input before the database is asked', async () => {
    for (const body of [
      { action: 'save', data: { teamId: TEAM, weekStart: '2026-10-13', days, notify: false } },
      { action: 'save', data: { teamId: TEAM, weekStart: '12/10/2026', days, notify: false } },
      { action: 'save', data: { teamId: 'x', weekStart: '2026-10-12', days, notify: false } },
      { action: 'save', data: { teamId: TEAM, weekStart: '2026-10-12', days: [{ day: 9, blocks: [] }], notify: false } },
      { action: 'delete', data: {} },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words database refusals as codes', async () => {
    const body = { action: 'save', data: { teamId: TEAM, weekStart: '2026-10-12', days, notify: false } }
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect((await call(body)).status).toBe(503)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } })
    expect((await call(body)).status).toBe(403)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'INVALID_PLAN' } })
    expect((await call(body)).status).toBe(400)
  })
})
