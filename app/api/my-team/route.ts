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
  ['TEAM_NAME_MISMATCH', 'teamDeleteNameMismatch', 400],
  ['TEAM_SUBMITTED', 'teamDeleteSubmitted', 409],
  ['TEAM_HAS_PAYMENT', 'teamDeletePaid', 409],
  ['TEAM_HAS_RESULTS', 'teamDeleteResults', 409],
  ['TEAM_HAS_VERIFIED_FIELDS', 'teamDeleteVerified', 409],
]

// A coach's own team (sql/78). Five actions, each one guarded SQL function: create my
// team (the page chooses the id, so a retry is the same team); enter a tournament with
// chosen accepted members (D1: they are told and may withdraw until the coach submits);
// withdraw from an entry (the athlete or their guardian); keep an old tournament team as
// my team (D2: its members are asked again). Delete my team (sql/79): the coach types the
// team's name to confirm, and the database checks it again and refuses a team that was
// submitted, paid, played or holds a verified position. Who may do which is auth.uid().
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
  } else if (body?.action === 'delete' && isId(data.teamId) && typeof data.name === 'string' && data.name.trim()) {
    rpc = 'delete_my_team'
    args = { p_team_id: data.teamId, p_confirm_name: data.name.trim().replace(/\s+/g, ' ').slice(0, 200) }
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
