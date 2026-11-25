import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { apiError } from '@/lib/api-error'
import { logServerError } from '@/lib/monitoring'

// The organizer rejects a waiting slip with a short reason (owner, 25 Nov 2026; sql/105). The team
// keeps waiting and the coach sends a new slip; the rejected row and its file stay as evidence.
// reject_payment_safely has the last word on who may and when; this route checks the same first
// so the common refusals need no database call, and words every refusal as a code (ADR-009).

type PaymentQueryResult = {
  id: string
  tournaments: { organizer_id: string } | { organizer_id: string }[] | null
}

const MAX_REASON = 200

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function POST(request: Request, props: { params: Promise<{ paymentId: string }> }) {
  const params = await props.params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 1 || reason.length > MAX_REASON) return apiError('paymentRejectReasonRequired', 400)

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'organizer' && profile?.role !== 'admin') return apiError('paymentForbidden', 403)

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, tournaments(organizer_id)')
    .eq('id', params.paymentId)
    .single()
  if (paymentError || !payment) return apiError('paymentNotFound', 404)

  const tournament = firstRelation((payment as PaymentQueryResult).tournaments)
  if (profile.role !== 'admin' && tournament?.organizer_id !== user.id) return apiError('paymentForbidden', 403)

  const { error } = await supabase.rpc('reject_payment_safely', { p_payment_id: params.paymentId, p_reason: reason })
  if (error) {
    if (error.message.includes('PAYMENT_NOT_PENDING')) return apiError('paymentNotPending', 409)
    if (error.message.includes('TEAM_NOT_PENDING')) return apiError('teamStatusLocked', 409)
    if (error.message.includes('REJECTION_REASON_REQUIRED')) return apiError('paymentRejectReasonRequired', 400)
    logServerError({ event: 'payment_reject_failed', userId: user.id, route: '/api/payments/[paymentId]/reject', metadata: { paymentId: params.paymentId, code: error.code ?? null }, error })
    return apiError('paymentRejectFailed', 400)
  }

  return NextResponse.json({ ok: true })
}
