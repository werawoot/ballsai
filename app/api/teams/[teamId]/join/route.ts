import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * An athlete asks to join a team. The row is created only by
 * request_team_membership with direction = 'request' and status = 'pending'; it grants
 * no roster eligibility until a manager approves it. Direct writes to team_members are
 * revoked.
 *
 * Eligibility (confirmed team, open tournament, caller is not the manager) is enforced
 * inside the RPC by sql/25-team-discovery-v1.sql, not by the picker — a caller who
 * knows a team UUID reaches this route directly. Until step 25 is applied the step 24
 * version accepts any existing team id, so the two new codes below simply never fire.
 */
export async function POST(_request: Request, { params }: { params: { teamId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const { data, error } = await supabase.rpc('request_team_membership', { p_team_id: params.teamId })
  if (error) {
    if (error.message.includes('TEAM_NOT_FOUND')) return NextResponse.json({ error: 'ไม่พบทีมนี้' }, { status: 404 })
    if (error.message.includes('CANNOT_REQUEST_OWN_TEAM')) return NextResponse.json({ error: 'คุณเป็นผู้ดูแลทีมนี้อยู่แล้ว ไม่ต้องส่งคำขอ' }, { status: 400 })
    if (error.message.includes('TEAM_NOT_ACCEPTING_REQUESTS')) return NextResponse.json({ error: 'ทีมนี้ยังไม่เปิดรับสมาชิก หรือรายการแข่งขันปิดรับสมัครแล้ว' }, { status: 409 })
    if (error.message.includes('ACTIVE_MEMBERSHIP_EXISTS')) return NextResponse.json({ error: 'คุณอยู่ในทีมนี้ หรือมีคำขอค้างอยู่แล้ว' }, { status: 409 })
    if (error.message.includes('TEAM_MEMBERSHIP_RATE_LIMITED')) return NextResponse.json({ error: 'เพิ่งส่งคำขอไป กรุณารอ 10 นาทีแล้วลองใหม่' }, { status: 429 })
    return NextResponse.json({ error: 'ส่งคำขอเข้าทีมไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, memberId: data })
}
