import { NextResponse } from 'next/server'
import { sendGuardianVerificationEmail } from '@/lib/email'
import { createGuardianToken, guardianPublicUrl, hashGuardianToken } from '@/lib/guardian-verification'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAccessTokenSupabaseClient } from '@/lib/supabase-server'

type Sport = 'football' | 'futsal' | 'basketball'
type Persona = 'athlete' | 'guardian' | 'coach_organizer'

type RequestBody = {
  persona?: Persona
  sport?: Sport
  athlete?: {
    displayName?: string
    position?: string | null
    currentTeam?: string | null
    province?: string | null
    birthDate?: string
  } | null
  guardianRequest?: {
    name?: string
    relationship?: string
    contact?: string
  } | null
  isPublic?: boolean
}

function accessTokenFrom(request: Request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

function clientMessage(code: string | undefined) {
  if (code === 'INVALID_PERSONA' || code === 'INVALID_SPORT') return 'ข้อมูลบทบาทหรือกีฬาไม่ถูกต้อง'
  if (code === 'INVALID_DISPLAY_NAME' || code === 'INVALID_BIRTH_DATE') return 'ข้อมูลนักกีฬายังไม่ครบหรือไม่ถูกต้อง'
  if (code === 'POSITION_REQUIRED' || code === 'PROVINCE_REQUIRED') return 'กรอกตำแหน่งและจังหวัดให้ครบ'
  if (code === 'PROFILE_REQUIRED') return 'ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่'
  return 'บันทึกข้อมูลเริ่มต้นไม่สำเร็จ'
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'mobile-onboarding', limit: 5, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ส่งข้อมูลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const accessToken = accessTokenFrom(request)
  if (!accessToken) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body?.persona || !body.sport) {
    return NextResponse.json({ error: 'ข้อมูลเริ่มต้นไม่ครบ' }, { status: 400 })
  }
  if (body.persona === 'athlete' && !body.athlete) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลนักกีฬาให้ครบ' }, { status: 400 })
  }

  const supabase = createAccessTokenSupabaseClient(accessToken)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  const { data: onboardingRows, error: onboardingError } = await supabase.rpc('complete_mobile_onboarding', {
    p_persona: body.persona,
    p_sport: body.sport,
    p_display_name: body.athlete?.displayName ?? null,
    p_position: body.athlete?.position ?? null,
    p_current_team: body.athlete?.currentTeam ?? null,
    p_province: body.athlete?.province ?? null,
    p_birth_date: body.athlete?.birthDate ?? null,
    p_is_public: body.isPublic === true,
  })
  if (onboardingError) {
    return NextResponse.json({ error: clientMessage(onboardingError.message) }, { status: 400 })
  }

  const result = onboardingRows?.[0] as {
    onboarding_completed_at?: string
    requires_guardian_verification?: boolean
    is_public?: boolean
  } | undefined
  const requiresGuardian = result?.requires_guardian_verification === true
  let guardianStatus: 'not_required' | 'pending' = 'not_required'

  if (requiresGuardian) {
    const guardian = body.guardianRequest
    const guardianName = guardian?.name?.trim()
    const relationship = guardian?.relationship?.trim()
    const guardianEmail = guardian?.contact?.trim().toLowerCase()
    if (!guardianName || !relationship || !guardianEmail) {
      return NextResponse.json({ error: 'กรอกอีเมลผู้ปกครองให้ครบ' }, { status: 400 })
    }

    const verificationToken = createGuardianToken()
    const revocationToken = createGuardianToken()
    const verificationUrl = guardianPublicUrl('/guardian/verify', verificationToken)
    const revocationUrl = guardianPublicUrl('/guardian/revoke', revocationToken)
    if (!verificationUrl || !revocationUrl) {
      return NextResponse.json({ error: 'ระบบยืนยันผู้ปกครองยังไม่พร้อม' }, { status: 503 })
    }

    const { data: requestRows, error: requestError } = await supabase.rpc('request_guardian_verification', {
      p_guardian_name: guardianName,
      p_relationship: relationship,
      p_guardian_email: guardianEmail,
      p_verification_token_hash: hashGuardianToken(verificationToken),
      p_revocation_token_hash: hashGuardianToken(revocationToken),
    })
    if (requestError) {
      logServerError({ event: 'mobile_guardian_request_failed', userId: user.id, route: '/api/mobile/onboarding' })
      return NextResponse.json({ error: 'บันทึกโปรไฟล์แล้ว แต่ส่งคำขอผู้ปกครองไม่สำเร็จ' }, { status: 503 })
    }

    const requestId = requestRows?.[0]?.request_id as string | undefined
    if (!requestId) return NextResponse.json({ error: 'สร้างคำขอยืนยันผู้ปกครองไม่สำเร็จ' }, { status: 500 })

    const emailResult = await sendGuardianVerificationEmail({
      athleteName: body.athlete?.displayName?.trim() || 'นักกีฬา',
      guardianName,
      guardianEmail,
      verificationUrl,
      revocationUrl,
    })
    if (!emailResult.sent) {
      await supabase.rpc('cancel_guardian_verification', { p_request_id: requestId })
      logServerError({
        event: 'mobile_guardian_verification_email_failed',
        userId: user.id,
        route: '/api/mobile/onboarding',
        metadata: { requestId, reason: emailResult.reason },
      })
      return NextResponse.json({ error: 'บันทึกโปรไฟล์แล้ว แต่ส่งอีเมลผู้ปกครองไม่สำเร็จ' }, { status: 503 })
    }
    guardianStatus = 'pending'
  }

  logServerEvent({ event: 'mobile_onboarding_completed', userId: user.id, route: '/api/mobile/onboarding' })
  return NextResponse.json({
    ok: true,
    completedAt: result?.onboarding_completed_at ?? null,
    isPublic: result?.is_public === true,
    guardianStatus,
  })
}
