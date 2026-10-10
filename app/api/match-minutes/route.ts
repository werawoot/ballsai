import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { cleanMinuteEntries } from '@/lib/match-minutes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Minutes played (sql/74): one action, save, which replaces the coach's sheet for one
// confirmed match. Who may is decided in the database by auth.uid(); the sheet is checked
// here the same way first, and errors are worded with apiError codes.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'match-minutes', limit: 60, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const data = body?.data ?? {}
  const length = data.length as number
  const entries = cleanMinuteEntries(data.entries, length)
  if (body?.action !== 'save' || typeof data.matchId !== 'string' || !UUID.test(data.matchId)
    || typeof data.teamId !== 'string' || !UUID.test(data.teamId) || !entries) return apiError('requestInvalid', 400)

  const { data: result, error } = await db.rpc('save_match_minutes', { p_match_id: data.matchId, p_team_id: data.teamId, p_length: length, p_entries: entries })
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    if (error.code === '42501') return apiError('notAllowed', 403)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
