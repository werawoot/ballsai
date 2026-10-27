import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { canonicalProvince } from '@/lib/thai-provinces'
import { normalisePhone, organizerRequestIssue, organizerRpcError } from '@/lib/organizer-access'
import { logServerError } from '@/lib/monitoring'

// Asks for organizer access (ADR-013, sql/89). request_organizer_access() holds every rule:
// one pending request, 7 days after a decline or revocation, every admin told. The route
// refuses a malformed form before the call.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'organizer-requests', limit: 10, windowSeconds: 60 * 60 })
  if (!rateLimit.allowed) return apiError('tooManyRequests', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const input = {
    orgName: typeof body?.orgName === 'string' ? body.orgName : '',
    orgType: typeof body?.orgType === 'string' ? body.orgType : '',
    province: typeof body?.province === 'string' ? body.province : '',
    phone: typeof body?.phone === 'string' ? body.phone : '',
    note: typeof body?.note === 'string' ? body.note.trim() : '',
  }
  const issue = organizerRequestIssue(input)
  if (issue) return apiError('requestInvalid', 400, { field: issue })

  const { data, error } = await db.rpc('request_organizer_access', {
    p_org_name: input.orgName.trim(),
    p_org_type: input.orgType,
    p_province: canonicalProvince(input.province.trim()),
    p_phone: normalisePhone(input.phone),
    p_note: input.note,
  })
  if (error) {
    const known = organizerRpcError(error)
    if (known) return apiError(known.code, known.status, error.details ? { until: error.details } : {})
    logServerError({ event: 'organizer_request_failed', userId: user.id, route: '/api/organizer-requests', error })
    return apiError('requestInvalid', 400)
  }
  return NextResponse.json({ ok: true, requestId: data })
}
