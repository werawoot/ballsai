import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseSkills } from '@/lib/coach-skills'
import { apiError } from '@/lib/api-error'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Two sides of one consent step (sql/69), like /api/coach-attestations: a coach proposes
// five skill numbers for an accepted member, and only that athlete accepts or declines.
// Who may do either is decided inside the SQL69 functions by auth.uid(), never by this
// payload; the route only refuses malformed input before the call.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'coach-skill-assessments', limit: 60, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })

  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; id?: string; data?: Record<string, unknown> } | null
  const bad = () => apiError('requestInvalid', 400)
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return bad()

  let rpc: string
  let args: Record<string, unknown>
  if (body.action === 'submit') {
    const athleteId = typeof body.data?.athleteId === 'string' ? body.data.athleteId : ''
    const skills = parseSkills(body.data?.skills)
    if (!UUID.test(athleteId) || !skills) return bad()
    rpc = 'submit_coach_skill_assessment'
    args = { p_team_id: body.id, p_athlete_id: athleteId, p_skills: skills }
  } else if (body.action === 'respond') {
    const status = body.data?.status
    if (status !== 'accepted' && status !== 'declined') return bad()
    rpc = 'respond_coach_skill_assessment'
    args = { p_id: body.id, p_status: status }
  } else {
    return bad()
  }

  const { data, error } = await db.rpc(rpc, args)
  if (error) {
    const status = error.code === '42501' ? 403
      : ['PGRST202', '42883', '42P01'].includes(error.code ?? '') ? 503
      : ['23505', '55000'].includes(error.code ?? '') ? 409 : 400
    return apiError(status === 403 ? 'notAllowed' : status === 503 ? 'featureNotReady' : status === 409 ? 'alreadyAnswered' : 'actionFailed', status)
  }
  return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } })
}
