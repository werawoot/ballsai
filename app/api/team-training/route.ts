import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { cleanPlanDays } from '@/lib/team-training'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isMonday = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).getUTCDay() === 1

// A team's weekly training plan (sql/72): one action, save (an empty list of days removes
// the week). The team's creator is checked in the database by auth.uid(); the plan is
// checked here the same way first, and errors are worded with apiError codes.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'team-training', limit: 120, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const data = body?.data ?? {}
  const days = cleanPlanDays(data.days)
  if (body?.action !== 'save' || typeof data.teamId !== 'string' || !UUID.test(data.teamId) || !isMonday(data.weekStart) || !days) {
    return apiError('requestInvalid', 400)
  }

  const { data: result, error } = await db.rpc('save_team_training_plan', {
    p_team_id: data.teamId, p_week_start: data.weekStart, p_days: days, p_notify: data.notify === true,
  })
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    if (error.code === '42501') return apiError('notAllowed', 403)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
