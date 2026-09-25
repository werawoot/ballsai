import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { title?: string; description?: string; sport?: string; province?: string; ageNote?: string; benefitNote?: string; deadlineAt?: string } | null
  if (!body?.title?.trim() || !body.description?.trim()) return NextResponse.json({ error: 'กรอกหัวข้อและรายละเอียดโอกาสให้ครบ' }, { status: 400 })
  const deadline = body.deadlineAt ? new Date(body.deadlineAt) : null
  if (deadline && Number.isNaN(deadline.getTime())) return NextResponse.json({ error: 'วันปิดรับไม่ถูกต้อง' }, { status: 400 })
  const { error } = await supabase.rpc('create_sponsorship_opportunity_safely', {
    p_title: body.title.trim(), p_description: body.description.trim(), p_sport: body.sport === 'futsal' ? 'futsal' : 'football',
    p_province: body.province?.trim() ?? '', p_age_note: body.ageNote?.trim() ?? '', p_benefit_note: body.benefitNote?.trim() ?? '',
    p_deadline_at: deadline?.toISOString() ?? null,
  })
  if (error) return NextResponse.json({ error: error.message.includes('SPONSOR_PROFILE_REQUIRED') ? 'สร้าง Brand Profile ก่อนเปิดโอกาส' : 'สร้างโอกาสไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
