import { NextResponse } from 'next/server'
import { auditedSchemaError, getAdminMutationContext } from '@/lib/admin-mutations'

type RankBody = {
  player_id?: string | null
  player_name?: string
  team?: string
  province?: string
  position?: string
  ovr?: number
  pts?: number
  pac?: number
  sho?: number
  pas?: number
  dri?: number
  def?: number
  rank_change?: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const positions = new Set(['FW', 'MF', 'DF', 'GK'])

function validRank(body: RankBody | null) {
  if (!body?.player_name?.trim() || !body.team?.trim() || !body.province?.trim()) return false
  if (body.player_id && !uuidPattern.test(body.player_id)) return false
  if (!positions.has(body.position ?? '')) return false
  const scores = [body.ovr, body.pac, body.sho, body.pas, body.dri, body.def]
  return scores.every(value => Number.isInteger(value) && (value ?? -1) >= 0 && (value ?? 101) <= 100)
    && Number.isInteger(body.pts) && (body.pts ?? -1) >= 0 && (body.pts ?? 100001) <= 100000
    && Number.isInteger(body.rank_change) && Math.abs(body.rank_change ?? 100001) <= 100000
}

export async function PATCH(request: Request, { params }: { params: { rankId: string } }) {
  if (!uuidPattern.test(params.rankId)) return NextResponse.json({ error: 'ไม่พบ Ranking' }, { status: 404 })
  const context = await getAdminMutationContext()
  if ('response' in context) return context.response
  const body = await request.json().catch(() => null) as RankBody | null
  if (!validRank(body)) return NextResponse.json({ error: 'ข้อมูล Ranking ไม่ถูกต้องหรือไม่ครบ' }, { status: 400 })

  const { error } = await context.supabase.rpc('admin_update_player_rank_with_audit', {
    p_rank_id: params.rankId,
    p_payload: body,
  })
  if (error) {
    if (auditedSchemaError(error.code, error.message)) return NextResponse.json({ error: 'ระบบ Audit ยังไม่พร้อม กรุณา apply SQL35 ก่อน' }, { status: 503 })
    return NextResponse.json({ error: error.code === '23505' ? 'บัญชีนี้มี Ranking ใน Season นี้แล้ว' : 'บันทึก Ranking ไม่สำเร็จ' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { rankId: string } }) {
  if (!uuidPattern.test(params.rankId)) return NextResponse.json({ error: 'ไม่พบ Ranking' }, { status: 404 })
  const context = await getAdminMutationContext()
  if ('response' in context) return context.response

  const { error } = await context.supabase.rpc('admin_delete_player_rank_with_audit', { p_rank_id: params.rankId })
  if (error) {
    if (auditedSchemaError(error.code, error.message)) return NextResponse.json({ error: 'ระบบ Audit ยังไม่พร้อม กรุณา apply SQL35 ก่อน' }, { status: 503 })
    return NextResponse.json({ error: 'ลบ Ranking ไม่สำเร็จ' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
