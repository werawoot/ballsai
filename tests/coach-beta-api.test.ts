import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: db.getUser }, rpc: db.rpc }),
}))

import { POST as manage } from '@/app/api/coach-management/route'
import { POST as attest } from '@/app/api/coach-attestations/route'
import { coachTeamOverview, type CoachTeamRow, type RosterRow } from '@/lib/coach-team-overview'

const TEAM = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const post = (body: unknown) =>
  new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  db.getUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } })
  db.rpc.mockResolvedValue({ data: { id: MEMBER }, error: null })
})

describe('POST /api/coach-management', () => {
  it('requires a session', async () => {
    db.getUser.mockResolvedValue({ data: { user: null } })

    expect((await manage(post({ action: 'remove', id: TEAM }))).status).toBe(401)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('removes a member of the coach’s own team through the guarded rpc', async () => {
    const response = await manage(post({ action: 'remove', id: TEAM, data: { memberId: MEMBER } }))

    expect(response.status).toBe(200)
    expect(db.rpc).toHaveBeenCalledWith('manage_coach_beta', {
      p_action: 'remove', p_id: TEAM, p_data: { memberId: MEMBER },
    })
  })

  it('refuses any action the coach contract does not define', async () => {
    for (const action of ['set_rating', 'verify', 'record_result', 'make_admin']) {
      expect((await manage(post({ action, id: TEAM }))).status, action).toBe(400)
    }
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('turns a database refusal into 403 rather than leaking the reason', async () => {
    db.rpc.mockResolvedValue({ error: { code: '42501' } })

    const response = await manage(post({ action: 'remove', id: TEAM, data: { memberId: MEMBER } }))

    expect(response.status).toBe(403)
    expect(await response.json()).not.toMatchObject({ error: expect.stringContaining('NOT_ALLOWED') })
  })

  it('never takes the actor identity from the request body', async () => {
    await manage(post({ action: 'remove', id: TEAM, data: { memberId: MEMBER, coachId: 'someone-else' } }))

    const [, args] = db.rpc.mock.calls[0]
    expect(Object.keys(args)).toEqual(['p_action', 'p_id', 'p_data'])
  })
})

describe('POST /api/coach-attestations', () => {
  it('requires a session', async () => {
    db.getUser.mockResolvedValue({ data: { user: null } })

    expect((await attest(post({ action: 'create', id: TEAM }))).status).toBe(401)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('records a structured playing-position claim against the coach’s own team', async () => {
    const response = await attest(post({
      action: 'create', id: TEAM, data: { athleteId: MEMBER, position: 'GK' },
    }))

    expect(response.status).toBe(200)
    expect(db.rpc).toHaveBeenCalledWith('attest_coach_claim_beta', {
      p_team_id: TEAM,
      p_data: { athleteId: MEMBER, position: 'GK' },
    })
  })

  it('accepts only the four allowed positions', async () => {
    for (const position of ['GK', 'DF', 'MF', 'FW']) {
      db.rpc.mockClear()
      expect((await attest(post({ action: 'create', id: TEAM, data: { athleteId: MEMBER, position } }))).status, position).toBe(200)
    }
    for (const position of ['STRIKER', 'gk ', '', 'CF', 'GK;DROP', 1, null]) {
      db.rpc.mockClear()
      expect((await attest(post({ action: 'create', id: TEAM, data: { athleteId: MEMBER, position } }))).status, String(position)).toBe(400)
      expect(db.rpc, String(position)).not.toHaveBeenCalled()
    }
  })

  it('refuses a free-text claim, which is no longer part of the model', async () => {
    const response = await attest(post({
      action: 'create', id: TEAM,
      data: { athleteId: MEMBER, claim: 'เล่นดีมาก เก่งที่สุดในรุ่น' },
    }))

    expect(response.status).toBe(400)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('never forwards anything beyond the athlete id and the position', async () => {
    await attest(post({
      action: 'create', id: TEAM,
      data: { athleteId: MEMBER, position: 'DF', rating: 99, verified: true, coachId: 'someone' },
    }))

    const [, args] = db.rpc.mock.calls[0] as [string, { p_data: Record<string, unknown> }]
    expect(Object.keys(args.p_data).sort()).toEqual(['athleteId', 'position'])
  })

  it('lets the athlete accept or decline their own attestation', async () => {
    await attest(post({ action: 'respond', id: MEMBER, data: { status: 'accepted' } }))

    expect(db.rpc).toHaveBeenCalledWith('respond_coach_attestation_beta', {
      p_attestation_id: MEMBER, p_status: 'accepted',
    })
  })

  it('accepts only the two responses the database allows', async () => {
    expect((await attest(post({ action: 'respond', id: MEMBER, data: { status: 'verified' } }))).status).toBe(400)
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('rejects an unknown action', async () => {
    expect((await attest(post({ action: 'approve', id: TEAM }))).status).toBe(400)
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

const team = (over: Partial<CoachTeamRow> = {}): CoachTeamRow => ({
  id: TEAM, name: 'ทีมลุงหมี', status: 'draft', tournament_id: 't1',
  tournaments: { name: 'BDS Cup' }, ...over,
})
const roster = (over: Partial<RosterRow> & { id: string }): RosterRow => ({
  team_id: TEAM, athlete_id: 'a1', status: 'pending', invited_at: '2026-09-01T00:00:00Z',
  athlete_profiles: { display_name: 'น้องเอ' }, ...over,
})

describe('coachTeamOverview', () => {
  it('groups each roster row under its own team', () => {
    const [view] = coachTeamOverview([team()], [roster({ id: 'm1' }), roster({ id: 'm2', team_id: 'other' })])

    expect(view.members.map(member => member.id)).toEqual(['m1'])
  })

  it('counts invitation states separately so the coach sees what is outstanding', () => {
    const [view] = coachTeamOverview([team()], [
      roster({ id: 'm1', status: 'accepted' }),
      roster({ id: 'm2', status: 'pending' }),
      roster({ id: 'm3', status: 'declined' }),
      roster({ id: 'm4', status: 'removed' }),
    ])

    expect(view.counts).toEqual({ accepted: 1, pending: 1, declined: 1, removed: 1 })
  })

  it('hides removed members from the active roster but keeps them countable', () => {
    const [view] = coachTeamOverview([team()], [roster({ id: 'm1', status: 'removed' })])

    expect(view.members).toEqual([])
    expect(view.counts.removed).toBe(1)
  })

  it('names the tournament the team is registered for', () => {
    const [view] = coachTeamOverview([team()], [])

    expect(view.tournamentName).toBe('BDS Cup')
  })

  it('asks for a first member when the roster is empty', () => {
    const [view] = coachTeamOverview([team()], [])

    expect(view.nextAction).toBe('เชิญสมาชิกคนแรกเข้าทีม')
  })

  it('asks the coach to wait while invitations are outstanding', () => {
    const [view] = coachTeamOverview([team()], [roster({ id: 'm1', status: 'pending' })])

    expect(view.nextAction).toContain('รอ')
  })

  it('asks the coach to submit the roster once members have accepted', () => {
    const [view] = coachTeamOverview([team()], [roster({ id: 'm1', status: 'accepted' })])

    expect(view.nextAction).toContain('ส่งรายชื่อ')
  })

  it('says the roster is locked once the team is submitted, with nothing left to do', () => {
    const [view] = coachTeamOverview([team({ status: 'submitted' })], [roster({ id: 'm1', status: 'accepted' })])

    expect(view.canManageRoster).toBe(false)
    expect(view.nextAction).toContain('ผู้จัด')
  })

  it('lets the coach manage the roster only while the team is a draft', () => {
    expect(coachTeamOverview([team({ status: 'draft' })], [])[0].canManageRoster).toBe(true)
    expect(coachTeamOverview([team({ status: 'submitted' })], [])[0].canManageRoster).toBe(false)
  })

  it('never claims a coach capability that belongs to the organizer', () => {
    const [view] = coachTeamOverview([team()], [roster({ id: 'm1', status: 'accepted' })])

    // Results and verification are organizer/admin work; the overview must say so
    // rather than offering the coach a button for it.
    expect(view.organizerOnly.some(item => item.includes('บันทึกผลการแข่งขัน'))).toBe(true)
    expect(view.nextAction).not.toContain('บันทึกผล')
  })
})
