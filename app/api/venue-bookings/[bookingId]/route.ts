import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(request: Request, { params }: { params: { bookingId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { status?: string } | null
  if (body?.status !== 'confirmed' && body?.status !== 'declined') return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
  const { error } = await supabase.rpc('respond_venue_booking_safely', { p_booking_id: params.bookingId, p_status: body.status })
  if (error) return NextResponse.json({ error: 'ตอบรับคำขอไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { bookingId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const { error } = await supabase.rpc('cancel_venue_booking_safely', { p_booking_id: params.bookingId })
  if (error) return NextResponse.json({ error: 'ยกเลิกคำขอไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
