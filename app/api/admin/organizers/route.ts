import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { organizerRpcError } from '@/lib/organizer-access'
import { logServerError, logServerEvent } from '@/lib/monitoring'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// An admin decides an organizer request or revokes organizer access (ADR-013, sql/89). The
// functions check the admin role themselves; the first decision wins under a row lock.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'admin-organizers', limit: 120, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  let rpc: string
  let args: Record<string, unknown>
  if (body?.action === 'decide' && typeof body.requestId === 'string' && UUID.test(body.requestId) && typeof body.approve === 'boolean') {
    rpc = 'decide_organizer_request'
    args = { p_request_id: body.requestId, p_approve: body.approve, p_reason: reason || null }
  } else if (body?.action === 'revoke' && typeof body.userId === 'string' && UUID.test(body.userId)) {
    rpc = 'revoke_organizer_access'
    args = { p_user_id: body.userId, p_reason: reason }
  } else {
    return apiError('requestInvalid', 400)
  }

  const { data, error } = await db.rpc(rpc, args)
  if (error) {
    const known = organizerRpcError(error)
    if (known) return apiError(known.code, known.status)
    logServerError({ event: 'admin_organizer_failed', userId: user.id, route: '/api/admin/organizers', metadata: { rpc }, error })
    return apiError('requestInvalid', 400)
  }
  // A revoke closes the organizer's open tournaments; the public lists should say so now.
  if (rpc === 'revoke_organizer_access') revalidateTag('public-tournaments')
  logServerEvent({ event: 'admin_organizer_decided', userId: user.id, route: '/api/admin/organizers', metadata: { rpc, result: String(data) } })
  return NextResponse.json({ ok: true, result: data })
}
