import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError, type ApiErrorCode } from '@/lib/api-error'
import { ENTRY_ROSTER_MAX, cleanTeamName } from '@/lib/own-team'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

// The database's refusals, each worded for the person who hit it.
const REFUSALS: [string, ApiErrorCode, number][] = [
  ['INVALID_TEAM_NAME', 'teamNameInvalid', 400],
  ['COACH_ORGANIZER_REQUIRED', 'teamCoachRequired', 403],
  ['TOO_MANY_TEAMS', 'teamTooMany', 409],
  ['TOURNAMENT_CLOSED', 'teamTournamentClosed', 409],
  ['ALREADY_HAS_TEAM_FOR_TOURNAMENT', 'teamAlreadyEntered', 409],
  ['ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER', 'teamAthleteElsewhere', 409],
  ['ATHLETE_NOT_ON_TEAM', 'teamAthleteNotOnTeam', 400],
  ['ROSTER_LOCKED', 'teamRosterLocked', 409],
  ['INVALID_ROSTER', 'teamRosterInvalid', 400],
  ['TOURNAMENT_NOT_FOUND', 'teamTournamentNotFound', 404],
]

// A coach's own team (sql/78). Four actions, each one guarded SQL78 function: create my
// team (the page chooses the id, so a retry is the same team); enter a tournament with
// chosen accepted members (D1: they are told and may withdraw until the coach submits);
// withdraw from an entry (the athlete or their guardian); keep an old tournament team as
// my team (D2: its members are asked again). Who may do which is decided by auth.uid().
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'my-team', limit: 30, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const data = body?.data ?? {}
  let rpc: string
  let args: Record<string, unknown>
  if (body?.action === 'create' && isId(data.id)) {
    const name = cleanTeamName(data.name)
    if (!name) return apiError('teamNameInvalid', 400)
    rpc = 'create_my_team'
    args = { p_team_id: data.id, p_name: name }
  } else if (body?.action === 'enter' && isId(data.teamId) && isId(data.tournamentId) && Array.isArray(data.athleteIds)) {
    const athletes = [...new Set(data.athleteIds)]
    if (athletes.length < 1 || athletes.length > ENTRY_ROSTER_MAX || !athletes.every(isId)) return apiError('teamRosterInvalid', 400)
    rpc = 'enter_tournament_from_team'
    args = { p_team_id: data.teamId, p_tournament_id: data.tournamentId, p_athlete_ids: athletes }
  } else if (body?.action === 'withdraw' && isId(data.memberId)) {
    rpc = 'withdraw_from_entry'
    args = { p_member_id: data.memberId }
  } else if (body?.action === 'keep' && isId(data.teamId)) {
    rpc = 'keep_as_my_team'
    args = { p_team_id: data.teamId }
  } else {
    return apiError('requestInvalid', 400)
  }

  const { data: result, error } = await db.rpc(rpc, args)
  if (error) {
    if (['PGRST202', '42883', '42P01', '42703'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    const refusal = REFUSALS.find(([message]) => error.message?.includes(message))
    if (refusal) return apiError(refusal[1], refusal[2])
    if (error.code === '42501') return apiError('notAllowed', 403)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
