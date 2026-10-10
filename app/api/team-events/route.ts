import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { parseEventInput } from '@/lib/team-events'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Team sessions and matches (sql/70; remind from sql/71). Five actions, each one guarded SQL70 function:
// the coach saves or cancels an event, ticks attendance and reminds who has not answered; an athlete or their guardian
// answers. Who may do which is decided in the database by auth.uid(); the route refuses
// malformed input before the call and words errors with apiError codes.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'team-events', limit: 120, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const bad = () => apiError('requestInvalid', 400)
  const data = body?.data ?? {}
  let rpc: string
  let args: Record<string, unknown>
  if (body?.action === 'save') {
    const event = parseEventInput(data)
    if (!event) return bad()
    rpc = 'save_team_event'
    args = { p_event_id: event.id, p_team_id: event.teamId, p_kind: event.kind, p_title: event.title, p_starts_at: event.startsAt, p_location: event.location, p_note: event.note }
  } else if (body?.action === 'cancel') {
    if (typeof data.id !== 'string' || !UUID.test(data.id)) return bad()
    rpc = 'cancel_team_event'
    args = { p_event_id: data.id }
  } else if (body?.action === 'respond') {
    if (typeof data.id !== 'string' || !UUID.test(data.id) || typeof data.athleteId !== 'string' || !UUID.test(data.athleteId)) return bad()
    if (data.answer !== 'yes' && data.answer !== 'no') return bad()
    rpc = 'respond_team_event'
    args = { p_event_id: data.id, p_athlete_id: data.athleteId, p_answer: data.answer }
  } else if (body?.action === 'remind') {
    if (typeof data.id !== 'string' || !UUID.test(data.id)) return bad()
    rpc = 'remind_team_event'
    args = { p_event_id: data.id }
  } else if (body?.action === 'attendance') {
    const present = data.present
    if (typeof data.id !== 'string' || !UUID.test(data.id) || !Array.isArray(present) || present.length > 60
      || !present.every(id => typeof id === 'string' && UUID.test(id)) || new Set(present).size !== present.length) return bad()
    rpc = 'set_team_attendance'
    args = { p_event_id: data.id, p_present: present }
  } else {
    return bad()
  }

  const { data: result, error } = await db.rpc(rpc, args)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    if (error.code === '42501') return apiError('notAllowed', 403)
    if (error.message?.includes('EVENT_CLOSED')) return apiError('eventClosed', 409)
    if (error.message?.includes('EVENT_NOT_STARTED')) return apiError('eventNotStarted', 409)
    if (error.message?.includes('TOO_MANY_EVENTS')) return apiError('tooManyEvents', 409)
    if (error.message?.includes('REMINDED_RECENTLY')) return apiError('remindedRecently', 409)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
