import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

// Team announcements (sql/71). Three actions, each one guarded SQL71 function: the coach
// posts or deletes a message; a recipient marks messages read. Who may do which is decided
// in the database by auth.uid(); the route refuses malformed input before the call.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'team-announcements', limit: 120, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const bad = () => apiError('requestInvalid', 400)
  const data = body?.data ?? {}
  let rpc: string
  let args: Record<string, unknown>
  if (body?.action === 'post') {
    const text = typeof data.body === 'string' ? data.body.trim() : ''
    const toAthletes = data.toAthletes === true, toGuardians = data.toGuardians === true
    if (!isId(data.id) || !isId(data.teamId) || !text || text.length > 500 || !(toAthletes || toGuardians)) return bad()
    rpc = 'post_team_announcement'
    args = { p_id: data.id, p_team_id: data.teamId, p_body: text, p_to_athletes: toAthletes, p_to_guardians: toGuardians }
  } else if (body?.action === 'delete') {
    if (!isId(data.id)) return bad()
    rpc = 'delete_team_announcement'
    args = { p_id: data.id }
  } else if (body?.action === 'read') {
    const ids = data.ids
    if (!Array.isArray(ids) || ids.length > 50 || !ids.every(isId)) return bad()
    rpc = 'mark_team_announcements_read'
    args = { p_ids: ids }
  } else {
    return bad()
  }

  const { data: result, error } = await db.rpc(rpc, args)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    if (error.code === '42501') return apiError('notAllowed', 403)
    if (error.message?.includes('TOO_MANY_ANNOUNCEMENTS')) return apiError('tooManyAnnouncements', 409)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
