import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// JSON is only a command payload. Identity and authorization come from auth.uid()
// inside the guarded RPC, never from fields supplied by a browser.
export async function managementRequest(request: Request, rpc: string, actions: readonly string[]) {
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || !actions.includes(body.action) || typeof body.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)
    || (body.data != null && (typeof body.data !== 'object' || Array.isArray(body.data)))
    || JSON.stringify(body).length > 10000) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  const { data, error } = await db.rpc(rpc, { p_action: body.action, p_id: body.id, p_data: body.data ?? {} })
  if (error) {
    const status = error.code === '42501' ? 403 : ['PGRST202', '42883', '42P01'].includes(error.code ?? '') ? 503
      : ['23505', '23P01', '40001', '55000'].includes(error.code ?? '') ? 409 : 400
    const message = status === 403 ? 'คุณไม่มีสิทธิ์ทำรายการนี้' : status === 503 ? 'ฟังก์ชันนี้ยังไม่เปิดใช้งาน กรุณาติดต่อทีมงาน'
      : status === 409 ? 'ข้อมูลเปลี่ยนไปหรือเวลาทับซ้อน กรุณาโหลดใหม่และเลือกอีกครั้ง' : 'ทำรายการไม่สำเร็จ ตรวจช่วงเวลา ราคา และสถานะรายการอีกครั้ง'
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } })
}
