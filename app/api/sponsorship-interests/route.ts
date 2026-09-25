import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { opportunityId?: string; message?: string } | null
  if (!body?.opportunityId) return NextResponse.json({ error: 'ไม่พบโอกาสสนับสนุน' }, { status: 400 })
  const { error } = await supabase.rpc('express_sponsorship_interest_safely', { p_opportunity_id: body.opportunityId, p_message: body.message?.trim() ?? '' })
  if (error) {
    const message = error.message.includes('PUBLIC_ATHLETE_PROFILE_REQUIRED')
      ? 'ต้องเปิดโปรไฟล์นักกีฬาเป็นสาธารณะก่อน เพื่อให้แบรนด์เห็นเฉพาะข้อมูลที่คุณอนุญาต'
      : error.message.includes('OPPORTUNITY_NOT_OPEN') ? 'โอกาสนี้ปิดรับแล้ว' : 'ส่งความสนใจไม่สำเร็จ'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
