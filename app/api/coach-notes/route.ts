import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { healthWord, parseNoteInput } from '@/lib/coach-notes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Coach notes about an athlete (sql/73). Three actions, each one guarded SQL73 function:
// the coach writes a note; the coach, the athlete or their guardian deletes one; the
// athlete or guardian reports one. Who may do which is decided in the database by
// auth.uid(); a note with a health word is refused here first, as it is there.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'coach-notes', limit: 60, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { action?: string; data?: Record<string, unknown> } | null
  const data = body?.data ?? {}
  let rpc: string
  let args: Record<string, unknown>
  if (body?.action === 'write') {
    if (typeof data.body === 'string' && healthWord(data.body)) return apiError('noteHealthWords', 400)
    const note = parseNoteInput(data)
    if (!note) return apiError('requestInvalid', 400)
    rpc = 'write_coach_note'
    args = { p_id: note.id, p_team_id: note.teamId, p_athlete_id: note.athleteId, p_category: note.category, p_body: note.body }
  } else if ((body?.action === 'delete' || body?.action === 'report') && typeof data.id === 'string' && UUID.test(data.id)) {
    rpc = body.action === 'delete' ? 'delete_coach_note' : 'report_coach_note'
    args = { p_id: data.id }
  } else {
    return apiError('requestInvalid', 400)
  }

  const { data: result, error } = await db.rpc(rpc, args)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return apiError('featureNotReady', 503)
    if (error.code === '42501') return apiError('notAllowed', 403)
    if (error.message?.includes('HEALTH_WORDS')) return apiError('noteHealthWords', 400)
    if (error.message?.includes('NOTE_TOO_SOON')) return apiError('noteTooSoon', 409)
    return apiError('actionFailed', 400)
  }
  return NextResponse.json({ ok: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
}
