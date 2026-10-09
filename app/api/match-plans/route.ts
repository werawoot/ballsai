import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

type LineupPlayer = {
  athlete_id?: string
  lineup_role?: 'starter' | 'substitute'
  position?: 'GK' | 'DF' | 'MF' | 'FW'
  slot_order?: number
  pos_x?: number | null
  pos_y?: number | null
}

type MatchPlanBody = {
  teamId?: string
  formation?: string
  matchFocus?: string
  teamTalk?: string
  players?: LineupPlayer[]
}

function validUuid(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

export async function GET(request: Request) {
  const teamId = new URL(request.url).searchParams.get('teamId')
  if (!validUuid(teamId)) return NextResponse.json({ error: 'ไม่พบทีมที่เลือก' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_match_plan_safely', { p_team_id: teamId })
  if (error) return NextResponse.json({ error: 'โหลดแผนก่อนแข่งไม่สำเร็จ' }, { status: error.message.includes('NOT_ALLOWED') ? 403 : 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'match-plans', limit: 30, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'บันทึกบ่อยเกินไป กรุณารอสักครู่' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = await request.json().catch(() => null) as MatchPlanBody | null
  if (!validUuid(body?.teamId ?? null) || !body?.formation?.trim() || !Array.isArray(body.players)) {
    return NextResponse.json({ error: 'ข้อมูลแผนก่อนแข่งไม่ครบ' }, { status: 400 })
  }
  if (body.formation.trim().length > 30 || (body.matchFocus?.length ?? 0) > 1000 || (body.teamTalk?.length ?? 0) > 1000 || body.players.length > 25) {
    return NextResponse.json({ error: 'ข้อมูลแผนยาวเกินกำหนด' }, { status: 400 })
  }

  // The pitch board sends the slot each starter stands in; keep it when every slot is a
  // whole number 0-24 and none repeats, else number by list order as older pages did.
  const slots = body.players.map(player => player.slot_order)
  const keepSlots = slots.every(slot => Number.isInteger(slot) && slot! >= 0 && slot! <= 24) && new Set(slots).size === slots.length
  const players = body.players.map((player, index) => ({
    athlete_id: player.athlete_id,
    lineup_role: player.lineup_role,
    position: player.position,
    slot_order: keepSlots ? player.slot_order! : index,
    pos_x: player.pos_x ?? null,
    pos_y: player.pos_y ?? null,
  }))
  // A point on the pitch (sql/68): both or neither, whole percent 0-100, starters only.
  const inPitch = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100
  const badPoint = players.some(player => (player.pos_x === null) !== (player.pos_y === null)
    || (player.pos_x !== null && (!inPitch(player.pos_x) || !inPitch(player.pos_y) || player.lineup_role !== 'starter')))
  if (badPoint) return NextResponse.json({ error: 'ตำแหน่งบนสนามไม่ถูกต้อง' }, { status: 400 })
  const invalidPlayer = players.some(player => !validUuid(player.athlete_id ?? null) || !['starter', 'substitute'].includes(player.lineup_role ?? '') || !['GK', 'DF', 'MF', 'FW'].includes(player.position ?? ''))
  if (invalidPlayer) return NextResponse.json({ error: 'รายชื่อนักกีฬาในแผนไม่ถูกต้อง' }, { status: 400 })

  const { data: planId, error } = await supabase.rpc('save_match_plan_safely', {
    p_team_id: body.teamId,
    p_formation: body.formation.trim(),
    p_match_focus: body.matchFocus?.trim() ?? '',
    p_team_talk: body.teamTalk?.trim() ?? '',
    p_players: players,
  })
  if (error) {
    const message = error.message.includes('PLAYER_NOT_ACCEPTED')
      ? 'เลือกได้เฉพาะสมาชิกที่ตอบรับทีมแล้ว'
      : error.message.includes('NOT_ALLOWED')
        ? 'คุณไม่มีสิทธิ์จัดแผนทีมนี้'
        : 'บันทึกแผนก่อนแข่งไม่สำเร็จ'
    return NextResponse.json({ error: message }, { status: error.message.includes('NOT_ALLOWED') ? 403 : 400 })
  }
  return NextResponse.json({ ok: true, planId })
}
