import { NextResponse } from 'next/server'

export const NOTIFICATION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SQL19 narrowed the browser grant to `update (read_at)` only. Any other column comes
// back as a permission error rather than silently doing nothing.
export function notificationWriteError(error: { code?: string; message?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return NextResponse.json(
      { error: 'ระบบแจ้งเตือนยังไม่พร้อม กรุณา apply SQL17 ก่อน', migration: 'sql/17-notifications-v1.sql' },
      { status: 503 },
    )
  }
  if (error.code === '42501') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์อัปเดตการแจ้งเตือนนี้' }, { status: 403 })
  }
  return NextResponse.json({ error: 'อัปเดตการแจ้งเตือนไม่สำเร็จ' }, { status: 400 })
}
