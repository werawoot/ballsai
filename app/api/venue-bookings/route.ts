import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type BookingBody = { slotId?: string; purpose?: string; note?: string }

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as BookingBody | null
  const purpose = body?.purpose?.trim()
  if (!body?.slotId || !purpose) return NextResponse.json({ error: 'กรอกวัตถุประสงค์การจอง' }, { status: 400 })
  const { data, error } = await supabase.rpc('request_venue_booking_safely', {
    p_slot_id: body.slotId,
    p_purpose: purpose,
    p_note: body?.note?.trim() ?? '',
  })
  if (error) {
    const unavailable = error.message.includes('SLOT_')
    return NextResponse.json({ error: unavailable ? 'ช่วงเวลานี้มีคำขอแล้วหรือไม่ว่าง' : 'ส่งคำขอจองไม่สำเร็จ' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, bookingId: data })
}
