import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/coach-notes/route'

const ID = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const ATHLETE = '33333333-3333-4333-8333-333333333333'
const call = (body: unknown) => POST(new Request('http://localhost/api/coach-notes', { method: 'POST', body: JSON.stringify(body) }))
const note = { id: ID, teamId: TEAM, athleteId: ATHLETE, category: 'tactical', body: ' ยืนตำแหน่งดีขึ้น ' }

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: ID, error: null }) })

// Coach notes (sql/73): the route refuses what the database would, before asking it.
describe('/api/coach-notes (sql/73)', () => {
  it('writes a trimmed note with the id the client chose', async () => {
    expect((await call({ action: 'write', data: note })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('write_coach_note', { p_id: ID, p_team_id: TEAM, p_athlete_id: ATHLETE, p_category: 'tactical', p_body: 'ยืนตำแหน่งดีขึ้น' })
  })

  it('forwards a delete and a report', async () => {
    await call({ action: 'delete', data: { id: ID } })
    await call({ action: 'report', data: { id: ID } })
    expect(rpc.mock.calls).toEqual([['delete_coach_note', { p_id: ID }], ['report_coach_note', { p_id: ID }]])
  })

  it('refuses a health word, a bad category or id, and an unknown action without asking the database', async () => {
    const health = await call({ action: 'write', data: { ...note, body: 'เจ็บข้อเท้า' } })
    expect(health.status).toBe(400)
    expect((await health.json()).code).toBe('noteHealthWords')
    for (const body of [
      { action: 'write', data: { ...note, category: 'attitude' } },
      { action: 'write', data: { ...note, id: 'x' } },
      { action: 'delete', data: { id: 'x' } },
      { action: 'edit', data: {} },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words database refusals as codes', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect((await call({ action: 'write', data: note })).status).toBe(503)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } })
    expect((await call({ action: 'write', data: note })).status).toBe(403)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'NOTE_TOO_SOON' } })
    const soon = await call({ action: 'write', data: note })
    expect(soon.status).toBe(409)
    expect((await soon.json()).code).toBe('noteTooSoon')
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'HEALTH_WORDS' } })
    expect((await (await call({ action: 'write', data: note })).json()).code).toBe('noteHealthWords')
  })
})
