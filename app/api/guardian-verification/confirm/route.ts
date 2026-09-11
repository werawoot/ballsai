import { NextResponse } from 'next/server'
import { logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { createPublicSupabaseClient } from '@/lib/supabase-server'

type TokenBody = { token?: string }

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'guardian-confirm', limit: 10, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as TokenBody | null
  const token = body?.token?.trim()
  if (!token || token.length > 200) return NextResponse.json({ error: 'ลิงก์ยืนยันไม่ถูกต้อง' }, { status: 400 })

  const { data: consentId, error } = await createPublicSupabaseClient()
    .rpc('confirm_guardian_verification', { p_verification_token: token })
  if (error) {
    return NextResponse.json({ error: 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 400 })
  }

  logServerEvent({
    event: 'guardian_verification_confirmed',
    route: '/api/guardian-verification/confirm',
    metadata: { consentId },
  })
  return NextResponse.json({ ok: true })
}
