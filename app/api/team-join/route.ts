import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError, type ApiErrorCode } from '@/lib/api-error'
import { isJoinToken, isRemovalReason, removalNote } from '@/lib/team-join'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const MISSING = ['PGRST202', '42883', '42P01', '42703']

// The database's refusals, each worded for the person who hit it.
const REFUSALS: [string, ApiErrorCode, number][] = [
  ['LINK_NOT_FOUND', 'joinLinkNotFound', 404],
  ['LINK_CLOSED', 'joinLinkClosed', 409],
  ['OWN_TEAM', 'joinOwnTeam', 400],
  ['ATHLETE_PROFILE_REQUIRED', 'joinProfileRequired', 409],
  ['ATHLETE_NAME_REQUIRED', 'joinNameRequired', 409],
  ['TEAM_REQUESTS_FULL', 'joinTeamFull', 409],
  ['TOO_MANY_REQUESTS', 'joinTooMany', 429],
  ['NOT_CLUB_TEAM', 'joinNotClubTeam', 400],
  ['ROSTER_LOCKED', 'teamRosterLocked', 409],
  ['ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER', 'teamAthleteElsewhere', 409],
  ['MEMBER_NOT_FOUND', 'memberNotFound', 404],
]

// Join links and requests, leaving and removal (ADR-011, sql/83). One guarded SQL function per
// action; who may do which is auth.uid() in the database.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'team-join', limit: 30, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const data = body?.data ?? {}
  let rpc: string
  let args: Record<string, unknown>
  // Before sql/83 a removal goes through sql/47's function, without a reason.
  let fallback: [string, Record<string, unknown>] | null = null
  if (body?.action === 'link' && isId(data.teamId)) {
    rpc = 'my_team_join_link'
    args = { p_team_id: data.teamId }
  } else if (body?.action === 'rotate' && isId(data.teamId)) {
    rpc = 'update_team_join_link'
    args = { p_team_id: data.teamId, p_rotate: true, p_open: null }
  } else if (body?.action === 'open' && isId(data.teamId) && typeof data.open === 'boolean') {
    rpc = 'update_team_join_link'
    args = { p_team_id: data.teamId, p_rotate: false, p_open: data.open }
  } else if (body?.action === 'request' && isJoinToken(data.token)) {
    rpc = 'request_to_join_team'
    args = { p_token: data.token }
  } else if (body?.action === 'decide' && isId(data.requestId) && typeof data.accept === 'boolean') {
    rpc = 'decide_join_request'
    args = { p_request_id: data.requestId, p_accept: data.accept }
  } else if (body?.action === 'leave' && isId(data.memberId)) {
    rpc = 'leave_team'
    args = { p_member_id: data.memberId }
  } else if (body?.action === 'remove' && isId(data.memberId) && isId(data.teamId) && isRemovalReason(data.reason)) {
    const note = removalNote(data.reason, data.note)
    if (note === undefined) return apiError('requestInvalid', 400)
    rpc = 'remove_team_member'
    args = { p_member_id: data.memberId, p_reason: data.reason, p_note: note }
    fallback = ['manage_coach_beta', { p_action: 'remove', p_id: data.teamId, p_data: { memberId: data.memberId } }]
  } else {
    return apiError('requestInvalid', 400)
  }

  let { data: result, error } = await db.rpc(rpc, args)
  // The fallback cannot keep a reason; the page is told so it does not promise one.
  const usedFallback = Boolean(error && fallback && MISSING.includes(error.code ?? ''))
  if (usedFallback && fallback) ({ data: result, error } = await db.rpc(fallback[0], fallback[1]))
  if (error) {
    if (MISSING.includes(error.code ?? '')) return apiError('featureNotReady', 503)
    const refusal = REFUSALS.find(([message]) => error.message?.includes(message))
    if (refusal) return apiError(refusal[1], refusal[2])
    if (error.code === '42501') return apiError('notAllowed', 403)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result, ...(usedFallback ? { reasonSent: false } : {}) }, { headers: { 'Cache-Control': 'no-store' } })
}
