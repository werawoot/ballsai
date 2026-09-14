import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { athleteId?: string; note?: string } | null
  if (!body?.athleteId) return NextResponse.json({ error: 'ไม่พบนักกีฬา' }, { status: 400 })
  const { error } = await supabase.rpc('add_scout_shortlist_safely', { p_athlete_id: body.athleteId, p_note: body.note?.trim() ?? '' })
  if (error) return NextResponse.json({ error: error.message.includes('ATHLETE_NOT_DISCOVERABLE') ? 'นักกีฬารายนี้ไม่ได้เปิดเผยโปรไฟล์แล้ว' : 'บันทึก Shortlist ไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { athleteId?: string } | null
  if (!body?.athleteId) return NextResponse.json({ error: 'ไม่พบนักกีฬา' }, { status: 400 })
  const { error } = await supabase.rpc('remove_scout_shortlist_safely', { p_athlete_id: body.athleteId })
  if (error) return NextResponse.json({ error: 'ลบจาก Shortlist ไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
