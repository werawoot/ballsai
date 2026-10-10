import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/team-events/route'

const ID = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const A = '33333333-3333-4333-8333-333333333333'
const call = (body: unknown) => POST(new Request('http://localhost/api/team-events', { method: 'POST', body: JSON.stringify(body) }))
const soon = new Date(Date.now() + 2 * 86400000).toISOString()

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: ID, error: null }) })

describe('/api/team-events (sql/70)', () => {
  it('saves an event with the id the client chose, so a retry updates the same one', async () => {
    expect((await call({ action: 'save', data: { id: ID, teamId: TEAM, kind: 'match', title: 'VS โคราช', startsAt: soon, location: '', note: '' } })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('save_team_event', { p_event_id: ID, p_team_id: TEAM, p_kind: 'match', p_title: 'VS โคราช', p_starts_at: soon, p_location: null, p_note: null })
  })

  it('forwards an answer, a cancel and an attendance list', async () => {
    await call({ action: 'respond', data: { id: ID, athleteId: A, answer: 'no' } })
    await call({ action: 'cancel', data: { id: ID } })
    await call({ action: 'attendance', data: { id: ID, present: [A] } })
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['respond_team_event', 'cancel_team_event', 'set_team_attendance'])
  })

  it('refuses malformed input before the database is asked', async () => {
    for (const body of [
      { action: 'save', data: { id: ID, teamId: TEAM, kind: 'party', title: 'x', startsAt: soon } },
      { action: 'respond', data: { id: ID, athleteId: A, answer: 'maybe' } },
      { action: 'attendance', data: { id: ID, present: [A, A] } },
      { action: 'attendance', data: { id: ID, present: ['x'] } },
      { action: 'cancel', data: { id: 'x' } },
      { action: 'delete', data: {} },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says why the database refused, and that the feature is off before SQL70', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'EVENT_CLOSED' } })
    const closed = await call({ action: 'respond', data: { id: ID, athleteId: A, answer: 'yes' } })
    expect([closed.status, (await closed.json()).code]).toEqual([409, 'eventClosed'])
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } })
    expect((await call({ action: 'cancel', data: { id: ID } })).status).toBe(403)
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect((await call({ action: 'cancel', data: { id: ID } })).status).toBe(503)
  })
})
