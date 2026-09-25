import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type SlotBody = { courtId?: string; startsAt?: string; endsAt?: string; priceBaht?: number }

// `<input type="datetime-local">` has no timezone. Venue owners enter Thai local
// time, so make the offset explicit rather than inheriting the server timezone.
const parseBangkokDateTime = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null
  return new Date(`${value}+07:00`)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as SlotBody | null
  const startsAt = parseBangkokDateTime(body?.startsAt)
  const endsAt = parseBangkokDateTime(body?.endsAt)
  const priceBaht = Number(body?.priceBaht)
  if (!body?.courtId || !startsAt || Number.isNaN(startsAt.valueOf()) || !endsAt || Number.isNaN(endsAt.valueOf()) || !Number.isInteger(priceBaht) || priceBaht < 0) {
    return NextResponse.json({ error: 'กรอกช่วงเวลาและราคาให้ถูกต้อง' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('create_venue_slot_safely', {
    p_court_id: body.courtId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_price_baht: priceBaht,
  })
  if (error) return NextResponse.json({ error: 'เพิ่มช่วงเวลาว่างไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true, slotId: data })
}
