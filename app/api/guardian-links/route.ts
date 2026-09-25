import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = await request.json().catch(() => null) as { athleteEmail?: string; consent?: boolean } | null
  const athleteEmail = body?.athleteEmail?.trim()
  if (!athleteEmail || !athleteEmail.includes('@')) return NextResponse.json({ error: 'กรุณากรอกอีเมลบัญชีนักกีฬาที่ถูกต้อง' }, { status: 400 })

  const { data, error } = await supabase.rpc('request_guardian_link', {
    p_athlete_email: athleteEmail,
    p_confirm_consent: body?.consent === true,
  })
  if (!error) return NextResponse.json({ ok: true, linkId: data })

  if (error.message.includes('GUARDIAN_ROLE_REQUIRED')) return NextResponse.json({ error: 'บัญชีนี้ต้องเลือกบทบาทผู้ปกครองใน onboarding ก่อน' }, { status: 403 })
  if (error.message.includes('ATHLETE_NOT_FOUND')) return NextResponse.json({ error: 'ไม่พบบัญชีนักกีฬาตามอีเมลนี้' }, { status: 404 })
  if (error.message.includes('ATHLETE_PROFILE_REQUIRED')) return NextResponse.json({ error: 'นักกีฬาต้องทำ onboarding ก่อนจึงเชื่อมบัญชีได้' }, { status: 400 })
  if (error.message.includes('CONSENT_REQUIRED')) return NextResponse.json({ error: 'กรุณายืนยันความยินยอมก่อนส่งคำขอ' }, { status: 400 })
  return NextResponse.json({ error: 'ส่งคำขอเชื่อมบัญชีไม่สำเร็จ' }, { status: 400 })
}
