import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkAddressRateLimit, checkUserRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { thaiDate } from '@/lib/athlete-private'
import { GOAL_LIMITS, parseRun } from '@/lib/running'
import { MISSING_CODES } from '@/lib/running-data'

// Running mode V1 (ADR-016, sql/108): the signed-in account adds a run, removes one of its own,
// or sets its weekly goal. Anyone signed in, any role, alone. The database decides (RLS and the
// add_my_run / set_my_run_goal checks); the form is checked here the same way first.
// Per account, behind a ceiling per address of ADDRESS_CEILING_MULTIPLIER times this (lib/rate-limit.ts, T65).
const RATE_LIMIT = { scope: 'runs', limit: 30, windowSeconds: 5 * 60 }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

export async function POST(request: Request) {
  const rateLimit = await checkAddressRateLimit(request, RATE_LIMIT)
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const userRateLimit = await checkUserRateLimit(user.id, RATE_LIMIT)
  if (!userRateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(userRateLimit.retryAfterSeconds) })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  let error: { code?: string; message: string } | null = null
  let id: string | null = null

  if (body?.action === 'add') {
    if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) return apiError('requestInvalid', 400)
    const parsed = parseRun({ date: text(body.date), km: text(body.km), minutes: text(body.minutes), seconds: text(body.seconds) }, thaiDate(new Date()))
    if (!parsed.ok) return apiError(parsed.problem, 400)
    const added = await db.rpc('add_my_run', { p_request_id: body.requestId, p_run_date: parsed.run.runDate, p_distance_m: parsed.run.distanceM, p_duration_s: parsed.run.durationS })
    error = added.error
    id = typeof added.data === 'string' ? added.data : null
  } else if (body?.action === 'goal') {
    const unit = body.unit
    const target = Number(body.target)
    if ((unit !== 'runs' && unit !== 'km') || !Number.isInteger(target) || target < 1 || target > GOAL_LIMITS[unit]) return apiError('runGoalInvalid', 400)
    ;({ error } = await db.rpc('set_my_run_goal', { p_unit: unit, p_target: target }))
  } else if (body?.action === 'remove') {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return apiError('requestInvalid', 400)
    const deleted = await db.from('run_logs').delete().eq('id', body.id).eq('user_id', user.id).select('id')
    error = deleted.error
    if (!error && (deleted.data ?? []).length === 0) return apiError('runNotFound', 404)
  } else {
    return apiError('requestInvalid', 400)
  }

  if (error) {
    if (MISSING_CODES.includes(error.code ?? '')) return apiError('featureNotReady', 503)
    if (error.message.includes('RUN_DAY_LIMIT')) return apiError('runDayLimit', 409)
    if (error.message.includes('RUN_DATE_INVALID')) return apiError('runDate', 400)
    if (error.message.includes('RUN_GOAL_INVALID')) return apiError('runGoalInvalid', 400)
    if (error.message.includes('RUN_INVALID')) return apiError('runInvalid', 400)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json(id ? { ok: true, id } : { ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
