import { NextResponse } from 'next/server'
import { sendGuardianVerificationEmail } from '@/lib/email'
import { createGuardianToken, guardianPublicUrl, hashGuardianToken } from '@/lib/guardian-verification'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAccessTokenSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'

type RequestBody = {
  guardianName?: string
  relationship?: string
  guardianEmail?: string
}

function accessTokenFrom(request: Request) {
  const value = request.headers.get('authorization')
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

function clientMessage(code: string | undefined) {
  if (code === 'GUARDIAN_REQUEST_RATE_LIMITED') return 'เพิ่งส่งคำขอไป กรุณารอ 10 นาทีแล้วลองอีกครั้ง'
  if (code === 'GUARDIAN_CONSENT_ALREADY_ACTIVE') return 'ผู้ปกครองยืนยันความยินยอมไว้แล้ว'
  if (code === 'GUARDIAN_VERIFICATION_NOT_REQUIRED') return 'บัญชีนี้ไม่ต้องยืนยันผู้ปกครอง'
  if (code === 'ATHLETE_PROFILE_REQUIRED') return 'กรุณากรอกข้อมูลนักกีฬาให้ครบก่อน'
  return 'ส่งคำขอยืนยันผู้ปกครองไม่สำเร็จ'
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'guardian-request', limit: 3, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null
  const guardianName = body?.guardianName?.trim()
  const relationship = body?.relationship?.trim()
  const guardianEmail = body?.guardianEmail?.trim().toLowerCase()
  if (!guardianName || !relationship || !guardianEmail) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลผู้ปกครองให้ครบ' }, { status: 400 })
  }

  const accessToken = accessTokenFrom(request)
  const supabase = accessToken
    ? createAccessTokenSupabaseClient(accessToken)
    : await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const verificationToken = createGuardianToken()
  const revocationToken = createGuardianToken()
  const verificationUrl = guardianPublicUrl('/guardian/verify', verificationToken)
  const revocationUrl = guardianPublicUrl('/guardian/revoke', revocationToken)
  if (!verificationUrl || !revocationUrl) {
    return NextResponse.json(
      { error: 'ระบบอีเมลยังไม่ได้ตั้งค่าโดเมนสำหรับลิงก์ยืนยัน' },
      { status: 503 },
    )
  }

  const { data: requestRows, error: requestError } = await supabase.rpc('request_guardian_verification', {
    p_guardian_name: guardianName,
    p_relationship: relationship,
    p_guardian_email: guardianEmail,
    p_verification_token_hash: hashGuardianToken(verificationToken),
    p_revocation_token_hash: hashGuardianToken(revocationToken),
  })
  if (requestError) {
    return NextResponse.json({ error: clientMessage(requestError.message) }, { status: 400 })
  }

  const requestId = requestRows?.[0]?.request_id as string | undefined
  if (!requestId) {
    logServerError({
      event: 'guardian_request_missing_id',
      userId: user.id,
      route: '/api/guardian-verification/request',
    })
    return NextResponse.json({ error: 'ส่งคำขอยืนยันผู้ปกครองไม่สำเร็จ' }, { status: 500 })
  }

  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .single()
  const emailResult = await sendGuardianVerificationEmail({
    athleteName: athlete?.display_name?.trim() || 'นักกีฬา',
    guardianName,
    guardianEmail,
    verificationUrl,
    revocationUrl,
  })
  if (!emailResult.sent) {
    await supabase.rpc('cancel_guardian_verification', { p_request_id: requestId })
    logServerError({
      event: 'guardian_verification_email_failed',
      userId: user.id,
      route: '/api/guardian-verification/request',
      metadata: { requestId, reason: emailResult.reason },
    })
    return NextResponse.json({ error: 'ส่งอีเมลยืนยันไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }, { status: 503 })
  }

  logServerEvent({
    event: 'guardian_verification_requested',
    userId: user.id,
    route: '/api/guardian-verification/request',
    metadata: { requestId },
  })
  return NextResponse.json({ ok: true, expiresInHours: 24 })
}
