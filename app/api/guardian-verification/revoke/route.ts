import { NextResponse } from 'next/server'
import { logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { createPublicSupabaseClient } from '@/lib/supabase-server'

type TokenBody = { token?: string; reason?: string }

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'guardian-revoke', limit: 5, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as TokenBody | null
  const token = body?.token?.trim()
  const reason = body?.reason?.trim()
  if (!token || token.length > 200 || (reason?.length ?? 0) > 500) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const { data: consentId, error } = await createPublicSupabaseClient()
    .rpc('revoke_guardian_consent', { p_revocation_token: token, p_reason: reason || null })
  if (error) return NextResponse.json({ error: 'ลิงก์ถอนความยินยอมไม่ถูกต้อง' }, { status: 400 })

  logServerEvent({
    event: 'guardian_consent_revoked',
    route: '/api/guardian-verification/revoke',
    metadata: { consentId },
  })
  return NextResponse.json({ ok: true })
}
