import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/coach-skill-assessments/route'

const TEAM = '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const ATHLETE = '11111111-1111-4111-8111-111111111111'
const call = (body: unknown) => POST(new Request('http://localhost/api/coach-skill-assessments', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 'x', error: null }) })

describe('/api/coach-skill-assessments (sql/69)', () => {
  it('forwards a coach rating with all five keys, unassessed ones as null', async () => {
    expect((await call({ action: 'submit', id: TEAM, data: { athleteId: ATHLETE, skills: { speed: 70, vision: 55 } } })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('submit_coach_skill_assessment', { p_team_id: TEAM, p_athlete_id: ATHLETE, p_skills: { speed: 70, stamina: null, strength: null, technique: null, vision: 55 } })
  })

  it('forwards an athlete answer', async () => {
    expect((await call({ action: 'respond', id: TEAM, data: { status: 'accepted' } })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('respond_coach_skill_assessment', { p_id: TEAM, p_status: 'accepted' })
  })

  it('refuses malformed input before the database is asked', async () => {
    for (const body of [
      { action: 'submit', id: TEAM, data: { athleteId: ATHLETE, skills: { speed: 120 } } },
      { action: 'submit', id: TEAM, data: { athleteId: ATHLETE, skills: {} } },
      { action: 'submit', id: TEAM, data: { athleteId: 'nope', skills: { speed: 70 } } },
      { action: 'respond', id: TEAM, data: { status: 'maybe' } },
      { action: 'delete', id: TEAM },
      { action: 'submit', id: 'not-a-uuid', data: { athleteId: ATHLETE, skills: { speed: 70 } } },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says plainly when the database refuses, or when SQL69 is not applied yet', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } })
    expect((await call({ action: 'respond', id: TEAM, data: { status: 'accepted' } })).status).toBe(403)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'ALREADY_ANSWERED' } })
    expect((await call({ action: 'respond', id: TEAM, data: { status: 'accepted' } })).status).toBe(409)
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    expect((await call({ action: 'respond', id: TEAM, data: { status: 'accepted' } })).status).toBe(503)
  })
})
