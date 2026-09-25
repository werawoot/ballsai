import { NextResponse } from 'next/server'

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SQL43 raises a stable token per failure. Match the token first: SQLSTATE 42501 and
// 22023 are each raised for more than one reason.
const PHOTO_ERRORS = [
  { token: 'VENUE_PHOTO_LIMIT_REACHED', status: 409, error: 'อัปโหลดได้สูงสุด 8 รูปต่อสนาม ลบรูปเดิมก่อนจึงจะเพิ่มได้' },
  { token: 'VENUE_PHOTO_OBJECT_NOT_FOUND', status: 409, error: 'ไฟล์ยังไม่ขึ้นระบบ กรุณาอัปโหลดใหม่อีกครั้ง' },
  { token: 'VENUE_PHOTO_NOT_FOUND', status: 404, error: 'ไม่พบรูปนี้ อาจถูกลบไปแล้ว' },
  { token: 'VENUE_NOT_FOUND', status: 404, error: 'ไม่พบสนามนี้' },
  { token: 'VENUE_OWNER_REQUIRED', status: 403, error: 'เฉพาะเจ้าของสนามเท่านั้นที่จัดการรูปนี้ได้' },
  { token: 'ADMIN_REQUIRED', status: 403, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' },
  { token: 'INVALID_VENUE_PHOTO_PATH', status: 400, error: 'ที่อยู่ไฟล์ไม่ถูกต้อง' },
  { token: 'INVALID_VENUE_PHOTO_ORDER', status: 400, error: 'ลำดับรูปไม่ถูกต้อง กรุณาโหลดหน้าใหม่' },
  { token: 'INVALID_CAPTION', status: 400, error: 'คำบรรยายภาพยาวเกิน 160 ตัวอักษร' },
  { token: 'AUTH_REQUIRED', status: 401, error: 'กรุณาเข้าสู่ระบบอีกครั้ง' },
] as const

export function venuePhotoRpcError(code: string | undefined, message: string) {
  if (code === 'PGRST202' || code === '42883' || code === '42P01') {
    return NextResponse.json(
      { error: 'ระบบรูปสนามยังไม่พร้อม กรุณา apply SQL43 ก่อน', migration: 'sql/43-venue-photos-v1.sql' },
      { status: 503 },
    )
  }
  const match = PHOTO_ERRORS.find(item => message.includes(item.token))
  if (match) return NextResponse.json({ error: match.error }, { status: match.status })
  return NextResponse.json({ error: 'จัดการรูปสนามไม่สำเร็จ' }, { status: 400 })
}
