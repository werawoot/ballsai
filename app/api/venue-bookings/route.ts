import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type BookingBody = { slotId?: string; purpose?: string; note?: string }

// request_venue_booking_safely raises a stable token. Match the token first: SQLSTATE
// 42501 covers more than one case, so the code alone cannot pick the status.
const bookingErrors = [
  { token: 'SLOT_ALREADY_REQUESTED', status: 409, error: 'ช่วงเวลานี้มีคำขอจองแล้ว กรุณาเลือกช่วงเวลาอื่น' },
  { token: 'SLOT_UNAVAILABLE', status: 409, error: 'ช่วงเวลานี้ไม่ว่างแล้ว กรุณาโหลดหน้าใหม่' },
  { token: 'AUTH_REQUIRED', status: 401, error: 'กรุณาเข้าสู่ระบบอีกครั้ง' },
] as const

function bookingRequestError(code: string | undefined, message: string) {
  if (code === 'PGRST202' || code === '42883' || code === '42P01') {
    return NextResponse.json(
      { error: 'ระบบจองสนามยังตั้งค่าไม่ครบ กรุณา apply SQL23 ก่อน', migration: 'sql/23-venues-and-bookings-v1.sql' },
      { status: 503 },
    )
  }

  const match = bookingErrors.find(item => message.includes(item.token))
  if (match) return NextResponse.json({ error: match.error }, { status: match.status })

  return NextResponse.json({ error: 'ส่งคำขอจองไม่สำเร็จ' }, { status: 400 })
}

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
  if (error) return bookingRequestError(error.code, error.message ?? '')
  return NextResponse.json({ ok: true, bookingId: data })
}
