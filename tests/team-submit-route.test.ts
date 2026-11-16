import { beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// POST /api/teams/[teamId]/submit turns each refusal of submit_tournament_team_safely
// (sql/20, sql/99) into a message. The four it always mapped keep their Thai sentence word for
// word; the three that fell through to "ส่งสมัครทีมไม่สำเร็จ" (a team with no tournament since
// sql/99, a team already submitted, a team id that does not exist) now say what happened.

const boundary = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: boundary.getUser }, rpc: boundary.rpc }),
}))

import { POST } from '@/app/api/teams/[teamId]/submit/route'

const TEAM = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const submit = () => POST(new Request(`http://localhost/api/teams/${TEAM}/submit`, { method: 'POST' }), { params: Promise.resolve({ teamId: TEAM }) })
const refuse = (message: string) => boundary.rpc.mockResolvedValue({ error: { message } })

beforeEach(() => {
  boundary.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'coach-1' } } })
  boundary.rpc.mockReset().mockResolvedValue({ error: null })
})

describe('POST /api/teams/[teamId]/submit', () => {
  it('submits through the one RPC and answers ok', async () => {
    const response = await submit()
    expect(boundary.rpc).toHaveBeenCalledWith('submit_tournament_team_safely', { p_team_id: TEAM })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('asks a signed-out caller to sign in, without calling the database', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })
    const response = await submit()
    expect(response.status).toBe(401)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['ACCEPTED_ROSTER_REQUIRED', 400, 'ต้องมีนักกีฬาตอบรับอย่างน้อย 1 คนก่อนส่งสมัคร'],
    ['TOURNAMENT_FULL', 409, 'รายการแข่งขันเต็มแล้ว'],
    ['TOURNAMENT_CLOSED', 400, 'รายการนี้ปิดรับสมัครแล้ว'],
    ['NOT_ALLOWED', 403, 'คุณไม่มีสิทธิ์ส่งสมัครทีมนี้'],
  ])('keeps the sentence it always sent for %s', async (code, status, sentence) => {
    refuse(code)
    const response = await submit()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: sentence })
  })

  it.each([
    ['TOURNAMENT_NOT_FOUND', 404, 'teamTournamentNotFound'],
    ['TEAM_NOT_DRAFT', 409, 'teamAlreadySubmitted'],
    ['TEAM_NOT_FOUND', 404, 'teamNotFound'],
  ] as const)('says what happened for %s, in both languages', async (refusal, status, code) => {
    refuse(refusal)
    const response = await submit()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ code, error: th.apiErrors[code] })
    expect(en.apiErrors[code]).toBeTruthy()
  })

  it('falls back to the general sentence for anything else', async () => {
    refuse('connection reset')
    const response = await submit()
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'ส่งสมัครทีมไม่สำเร็จ' })
  })
})
