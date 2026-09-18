import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Must stay in step with SQL47's claimed_value check constraint.
const POSITIONS = ['GK', 'DF', 'MF', 'FW']

// Two distinct capabilities behind one route, because they are two sides of one
// consent step: a coach states the athlete's playing position, and only the athlete
// themselves answers it. Accepting confirms that one field -- not the athlete's
// identity, rating, ability, statistics or profile.
// Both are authorised inside the SQL47 RPCs by auth.uid(), never by this payload.
export async function POST(request: Request) {
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = await request.json().catch(() => null) as
    { action?: string; id?: string; data?: Record<string, unknown> } | null
  const bad = () => NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return bad()

  let rpc: string
  let args: Record<string, unknown>
  if (body.action === 'create') {
    const athleteId = typeof body.data?.athleteId === 'string' ? body.data.athleteId : ''
    const position = body.data?.position
    // One structured field with an explicit value set. There is no free-text claim, so
    // prose cannot reach the database and nothing beyond these two fields is forwarded.
    if (!UUID.test(athleteId) || !POSITIONS.includes(position as string)) return bad()
    rpc = 'attest_coach_claim_beta'
    args = { p_team_id: body.id, p_data: { athleteId, position } }
  } else if (body.action === 'respond') {
    const status = body.data?.status
    // Only the two answers SQL47 accepts; anything else is refused before the call.
    if (status !== 'accepted' && status !== 'declined') return bad()
    rpc = 'respond_coach_attestation_beta'
    args = { p_attestation_id: body.id, p_status: status }
  } else {
    return bad()
  }

  const { data, error } = await db.rpc(rpc, args)
  if (error) {
    const status = error.code === '42501' ? 403
      : ['PGRST202', '42883', '42P01'].includes(error.code ?? '') ? 503
      : ['23505', '55000'].includes(error.code ?? '') ? 409 : 400
    const message = status === 403 ? 'คุณไม่มีสิทธิ์ทำรายการนี้'
      : status === 503 ? 'ฟังก์ชันนี้ยังไม่เปิดใช้งาน กรุณาติดต่อทีมงาน'
      : status === 409 ? 'รายการนี้ถูกตอบไปแล้วหรือมีอยู่แล้ว กรุณาโหลดใหม่'
      : 'ทำรายการไม่สำเร็จ กรุณาตรวจข้อมูลอีกครั้ง'
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } })
}
