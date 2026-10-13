import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) }))

import { POST } from '@/app/api/my-team/route'

const T = '11111111-1111-4111-8111-111111111111'
const R = '22222222-2222-4222-8222-222222222222'
const A = '33333333-3333-4333-8333-333333333333'
const call = (body: unknown) => POST(new Request('http://localhost/api/my-team', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: T, error: null }) })

// A coach's own team (sql/78, docs/coach-own-team-v1.md). Who may do what is decided in
// the database; the route checks shapes and words each refusal.
describe('/api/my-team (sql/78)', () => {
  it('creates a team with the id the page chose, the name tidied', async () => {
    expect((await call({ action: 'create', data: { id: T, name: '  Lions   U13 ' } })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('create_my_team', { p_team_id: T, p_name: 'Lions U13' })
  })

  it('enters a tournament with the chosen athletes, without repeats', async () => {
    await call({ action: 'enter', data: { teamId: T, tournamentId: R, athleteIds: [A, A] } })
    expect(rpc).toHaveBeenCalledWith('enter_tournament_from_team', { p_team_id: T, p_tournament_id: R, p_athlete_ids: [A] })
  })

  it('withdraws from an entry and keeps an old team', async () => {
    await call({ action: 'withdraw', data: { memberId: A } })
    await call({ action: 'keep', data: { teamId: R } })
    expect(rpc.mock.calls).toEqual([['withdraw_from_entry', { p_member_id: A }], ['keep_as_my_team', { p_team_id: R }]])
  })

  it('refuses bad shapes without asking the database', async () => {
    for (const body of [
      { action: 'create', data: { id: 'x', name: 'Lions' } },
      { action: 'create', data: { id: T, name: 'x' } },
      { action: 'enter', data: { teamId: T, tournamentId: R, athleteIds: [] } },
      { action: 'enter', data: { teamId: T, tournamentId: R, athleteIds: Array.from({ length: 61 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`) } },
      { action: 'enter', data: { teamId: T, tournamentId: 'x', athleteIds: [A] } },
      { action: 'withdraw', data: { memberId: 'x' } },
      { action: 'delete', data: { teamId: T } },
    ]) expect((await call(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('words each database refusal as its own code', async () => {
    const cases: [string, string, number, string][] = [
      ['22023', 'INVALID_TEAM_NAME', 400, 'teamNameInvalid'],
      ['42501', 'COACH_ORGANIZER_REQUIRED', 403, 'teamCoachRequired'],
      ['22023', 'TOO_MANY_TEAMS', 409, 'teamTooMany'],
      ['55000', 'TOURNAMENT_CLOSED', 409, 'teamTournamentClosed'],
      ['23505', 'ALREADY_HAS_TEAM_FOR_TOURNAMENT', 409, 'teamAlreadyEntered'],
      ['22023', 'ATHLETE_NOT_ON_TEAM', 400, 'teamAthleteNotOnTeam'],
      ['23505', 'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER', 409, 'teamAthleteElsewhere'],
      ['55000', 'ROSTER_LOCKED', 409, 'teamRosterLocked'],
      ['P0002', 'TOURNAMENT_NOT_FOUND', 404, 'teamTournamentNotFound'],
      ['42501', 'NOT_ALLOWED', 403, 'notAllowed'],
      ['PGRST202', 'missing', 503, 'featureNotReady'],
    ]
    for (const [code, message, status, apiCode] of cases) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message } })
      const response = await call({ action: 'create', data: { id: T, name: 'Lions' } })
      expect([message, response.status, (await response.json()).code]).toEqual([message, status, apiCode])
    }
  })
})
