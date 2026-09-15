import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type RpcError = { code?: string; message?: string }

function bookingRpcError(error: RpcError, action: 'respond' | 'cancel') {
  const message = error.message ?? ''
  if (message.includes('AUTH_REQUIRED')) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบอีกครั้ง' }, { status: 401 })
  }
  if (message.includes('VENUE_OWNER_REQUIRED')) {
    return NextResponse.json({ error: 'เฉพาะเจ้าของสนามนี้เท่านั้นที่ตอบรับได้' }, { status: 403 })
  }
  if (message.includes('BOOKING_NOT_CANCELLABLE') || message.includes('BOOKING_NOT_PENDING')) {
    return NextResponse.json({ error: 'สถานะคำขอนี้เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่' }, { status: 409 })
  }
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
    return NextResponse.json(
      { error: 'ระบบจองสนามยังตั้งค่าไม่ครบ กรุณา apply SQL23 ก่อน', migration: 'sql/23-venues-and-bookings-v1.sql' },
      { status: 503 },
    )
  }
  return NextResponse.json(
    { error: action === 'respond' ? 'ตอบรับคำขอไม่สำเร็จ' : 'ยกเลิกคำขอไม่สำเร็จ' },
    { status: 400 },
  )
}

export async function PATCH(request: Request, { params }: { params: { bookingId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { status?: string } | null
  if (body?.status !== 'confirmed' && body?.status !== 'declined') return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
  const { error } = await supabase.rpc('respond_venue_booking_safely', { p_booking_id: params.bookingId, p_status: body.status })
  if (error?.message?.includes('BOOKING_NOT_PENDING')) {
    const { data: booking } = await supabase.from('venue_booking_requests').select('status').eq('id', params.bookingId).maybeSingle()
    if (booking?.status === body.status) return NextResponse.json({ ok: true, alreadyResponded: true })
  }
  if (error) return bookingRpcError(error, 'respond')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { bookingId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const { error } = await supabase.rpc('cancel_venue_booking_safely', { p_booking_id: params.bookingId })
  if (error) return bookingRpcError(error, 'cancel')
  return NextResponse.json({ ok: true })
}
