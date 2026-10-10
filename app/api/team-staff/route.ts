import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError, type ApiErrorCode } from '@/lib/api-error'
import { cleanStaffEmail } from '@/lib/team-staff'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// The database's refusals, each worded for the person who hit it.
const REFUSALS: [string, ApiErrorCode, number][] = [
  ['USER_NOT_FOUND', 'staffAccountNotFound', 404],
  ['TOO_MANY_STAFF', 'staffTooMany', 409],
  ['STAFF_IS_MEMBER', 'staffIsMember', 409],
  ['STAFF_UNDER_18', 'staffUnder18', 400],
  ['CANNOT_INVITE_SELF', 'staffInviteSelf', 400],
  ['INVALID_EMAIL', 'staffEmailInvalid', 400],
  ['STAFF_INVITE_CLOSED', 'staffInviteClosed', 409],
  ['ADULT_REQUIRED', 'staffAdultRequired', 400],
]

// Assistant coaches (sql/75). Three actions, each one guarded SQL75 function: the head
// coach invites an existing account by email; the invited person accepts (confirming they
// are 18 or over) or declines; the head coach removes an assistant or the assistant
// leaves. Who may do which is decided in the database by auth.uid(). The rate limit also
// slows anyone trying emails to learn which ones have an account.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'team-staff', limit: 30, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const data = body?.data ?? {}
  let rpc: string
  let args: Record<string, unknown>
  if (body?.action === 'invite' && typeof data.teamId === 'string' && UUID.test(data.teamId)) {
    const email = cleanStaffEmail(data.email)
    if (!email) return apiError('staffEmailInvalid', 400)
    rpc = 'invite_team_staff'
    args = { p_team_id: data.teamId, p_email: email }
  } else if (body?.action === 'respond' && typeof data.id === 'string' && UUID.test(data.id) && typeof data.accept === 'boolean') {
    if (data.accept && data.adult !== true) return apiError('staffAdultRequired', 400)
    rpc = 'respond_team_staff'
    args = { p_staff_id: data.id, p_accept: data.accept, p_adult: data.accept && data.adult === true }
  } else if (body?.action === 'remove' && typeof data.id === 'string' && UUID.test(data.id)) {
    rpc = 'remove_team_staff'
    args = { p_staff_id: data.id }
  } else {
    return apiError('requestInvalid', 400)
  }

  const { data: result, error } = await db.rpc(rpc, args)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    const refusal = REFUSALS.find(([message]) => error.message?.includes(message))
    if (refusal) return apiError(refusal[1], refusal[2])
    if (error.code === '42501') return apiError('notAllowed', 403)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
