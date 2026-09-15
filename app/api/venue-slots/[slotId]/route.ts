import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// close_venue_slot_safely raises a stable token with a dedicated SQLSTATE. Match the
// code first and keep the token as a fallback for drivers that drop the code.
const slotErrors = [
  { code: '55006', token: 'SLOT_HAS_ACTIVE_BOOKING', status: 409, error: 'ช่วงเวลานี้มีคำขอจองอยู่ จึงยังปิดไม่ได้' },
  { code: '55000', token: 'SLOT_NOT_OPEN', status: 409, error: 'ช่วงเวลานี้ถูกปิดไปแล้ว' },
  { code: 'P0002', token: 'SLOT_NOT_FOUND', status: 404, error: 'ไม่พบช่วงเวลานี้' },
  { code: '42501', token: 'VENUE_OWNER_REQUIRED', status: 403, error: 'เฉพาะเจ้าของสนามเท่านั้นที่ปิดช่วงเวลานี้ได้' },
  { code: '42501', token: 'AUTH_REQUIRED', status: 401, error: 'กรุณาเข้าสู่ระบบก่อน' },
] as const

// SQL38 is not applied yet in every environment. Until it is, refuse loudly instead of
// looking like an ordinary failure — same convention as the audited admin routes.
function missingMigration(code?: string, message?: string) {
  return code === 'PGRST202' || code === '42883' || code === '42P01'
    || Boolean(message?.includes('close_venue_slot_safely'))
}

function errorResponse(code: string | undefined, message: string) {
  if (missingMigration(code, message)) {
    return NextResponse.json(
      { error: 'ระบบปิดช่วงเวลายังไม่พร้อม กรุณา apply SQL38 ก่อน', migration: 'sql/38-close-venue-slot-v1.sql' },
      { status: 503 }
    )
  }

  // The token is the reliable signal: SQLSTATE 42501 is raised for two different
  // tokens, so fall back to the code only when it maps to exactly one of them.
  const byToken = slotErrors.find(item => message.includes(item.token))
  const byCode = slotErrors.filter(item => code !== undefined && item.code === code)
  const match = byToken ?? (byCode.length === 1 ? byCode[0] : undefined)
  if (match) return NextResponse.json({ error: match.error }, { status: match.status })

  return NextResponse.json({ error: 'ปิดช่วงเวลาไม่สำเร็จ' }, { status: 400 })
}

export async function DELETE(_request: Request, { params }: { params: { slotId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const slotId = params.slotId
  if (!UUID_PATTERN.test(slotId)) {
    return NextResponse.json({ error: 'รหัสช่วงเวลาไม่ถูกต้อง' }, { status: 400 })
  }

  const { error } = await supabase.rpc('close_venue_slot_safely', { p_slot_id: slotId })
  if (error) return errorResponse(error.code, error.message ?? '')

  return NextResponse.json({ ok: true })
}
