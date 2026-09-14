import { NextResponse } from 'next/server'
import { auditedSchemaError, getAdminMutationContext } from '@/lib/admin-mutations'

type HallBody = {
  season?: string
  category?: string
  age_group?: string
  province?: string | null
  athlete_id?: string | null
  player_rank_id?: string
  athlete_name?: string
  team_name?: string | null
  position?: string | null
  citation?: string
}

const categories = new Set(['champion', 'mvp', 'golden_boot', 'province_leader', 'rising_star', 'fair_play'])
const ageGroups = new Set(['U12', 'U15', 'U18', 'OPEN'])

export async function POST(request: Request) {
  const context = await getAdminMutationContext()
  if ('response' in context) return context.response
  const body = await request.json().catch(() => null) as HallBody | null
  if (!body?.season?.trim() || !categories.has(body.category ?? '') || !ageGroups.has(body.age_group ?? '')
    || !body.player_rank_id || !body.athlete_name?.trim() || !body.citation?.trim() || body.citation.trim().length > 280) {
    return NextResponse.json({ error: 'ข้อมูล Hall of Fame ไม่ถูกต้องหรือไม่ครบ' }, { status: 400 })
  }

  const { data, error } = await context.supabase.rpc('admin_award_hall_entry_with_audit', { p_payload: body })
  if (error) {
    if (auditedSchemaError(error.code, error.message)) return NextResponse.json({ error: 'ระบบ Audit ยังไม่พร้อม กรุณา apply SQL35 ก่อน' }, { status: 503 })
    return NextResponse.json({ error: error.code === '23505' ? 'นักกีฬาคนนี้มีรางวัลหมวดนี้ในฤดูกาล/รุ่นอายุนี้แล้ว' : 'เผยแพร่ Hall of Fame ไม่สำเร็จ' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, id: data })
}
