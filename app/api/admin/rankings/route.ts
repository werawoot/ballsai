import { NextResponse } from 'next/server'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import { auditedSchemaError, getAdminMutationContext } from '@/lib/admin-mutations'

type RankBody = {
  player_id?: string
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

const positions = new Set(['FW', 'MF', 'DF', 'GK'])

function validRank(body: RankBody | null) {
  if (!body?.player_id || !body.player_name?.trim() || !body.team?.trim() || !body.province?.trim()) return false
  if (!positions.has(body.position ?? '')) return false
  const scores = [body.ovr, body.pac, body.sho, body.pas, body.dri, body.def]
  return scores.every(value => Number.isInteger(value) && (value ?? -1) >= 0 && (value ?? 101) <= 100)
    && Number.isInteger(body.pts) && (body.pts ?? -1) >= 0 && (body.pts ?? 100001) <= 100000
    && Number.isInteger(body.rank_change) && Math.abs(body.rank_change ?? 100001) <= 100000
}

export async function POST(request: Request) {
  const context = await getAdminMutationContext()
  if ('response' in context) return context.response

  const body = await request.json().catch(() => null) as RankBody | null
  if (!validRank(body)) return NextResponse.json({ error: 'ข้อมูล Ranking ไม่ถูกต้องหรือไม่ครบ' }, { status: 400 })

  const { data, error } = await context.supabase.rpc('admin_create_player_rank_with_audit', {
    p_payload: { ...body, sport: ACTIVE_SPORT, season: ACTIVE_SEASON },
  })
  if (error) {
    if (auditedSchemaError(error.code, error.message)) {
      return NextResponse.json({ error: 'ระบบ Audit ยังไม่พร้อม กรุณา apply SQL35 ก่อน' }, { status: 503 })
    }
    return NextResponse.json({ error: error.code === '23505' ? `บัญชีนี้มี Ranking ใน Season ${ACTIVE_SEASON} แล้ว` : 'สร้าง Ranking ไม่สำเร็จ' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, id: data })
}
