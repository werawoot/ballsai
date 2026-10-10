import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/team-announcements/route'
import { POST as EVENTS } from '@/app/api/team-events/route'

const ID = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const call = (body: unknown) => POST(new Request('http://localhost/api/team-announcements', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 2, error: null }) })

// Team announcements (sql/71): the route checks the shape, the database decides who may.
describe('/api/team-announcements (sql/71)', () => {
  it('posts with the id the client chose, trimmed, to the audience picked', async () => {
    const response = await call({ action: 'post', data: { id: ID, teamId: TEAM, body: '  เลื่อนซ้อมเป็น 5 โมง  ', toAthletes: true, toGuardians: false } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, data: 2 })
    expect(rpc).toHaveBeenCalledWith('post_team_announcement', { p_id: ID, p_team_id: TEAM, p_body: 'เลื่อนซ้อมเป็น 5 โมง', p_to_athletes: true, p_to_guardians: false })
  })

  it('forwards a delete and a read', async () => {
    await call({ action: 'delete', data: { id: ID } })
    await call({ action: 'read', data: { ids: [ID] } })
    expect(rpc.mock.calls).toEqual([['delete_team_announcement', { p_id: ID }], ['mark_team_announcements_read', { p_ids: [ID] }]])
  })

  it('refuses malformed input before the database is asked', async () => {
    for (const body of [
      { action: 'post', data: { id: ID, teamId: TEAM, body: '   ', toAthletes: true, toGuardians: true } },
      { action: 'post', data: { id: ID, teamId: TEAM, body: 'ก'.repeat(501), toAthletes: true, toGuardians: true } },
      { action: 'post', data: { id: ID, teamId: TEAM, body: 'x', toAthletes: false, toGuardians: false } },
      { action: 'post', data: { id: 'x', teamId: TEAM, body: 'x', toAthletes: true, toGuardians: true } },
      { action: 'delete', data: { id: 'x' } },
      { action: 'read', data: { ids: Array.from({ length: 51 }, () => ID) } },
      { action: 'read', data: { ids: ['x'] } },
      { action: 'edit', data: {} },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words database refusals as codes: not ready, not allowed, daily limit', async () => {
    const post = { action: 'post', data: { id: ID, teamId: TEAM, body: 'x', toAthletes: true, toGuardians: true } }
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect((await call(post)).status).toBe(503)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } })
    expect((await call(post)).status).toBe(403)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'TOO_MANY_ANNOUNCEMENTS' } })
    const limited = await call(post)
    expect(limited.status).toBe(409)
    expect((await limited.json()).code).toBe('tooManyAnnouncements')
  })
})

describe('/api/team-events remind (sql/71)', () => {
  it('reminds the members who have not answered, once per 6 hours', async () => {
    const remind = () => EVENTS(new Request('http://localhost/api/team-events', { method: 'POST', body: JSON.stringify({ action: 'remind', data: { id: ID } }) }))
    expect((await remind()).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('remind_team_event', { p_event_id: ID })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'REMINDED_RECENTLY' } })
    const again = await remind()
    expect(again.status).toBe(409)
    expect((await again.json()).code).toBe('remindedRecently')
  })
})
