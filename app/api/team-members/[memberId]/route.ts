import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const ACTIONS = ['respond', 'approve', 'decline', 'remove'] as const
type Action = (typeof ACTIONS)[number]

type Body = {
  /** Omitted for the original invite-response call, which sends `status` alone. */
  action?: unknown
  status?: unknown
  reason?: unknown
}

/**
 * The body is untrusted JSON, so the discriminator is checked at runtime, not just
 * typed. Anything that is not one of the four known actions is rejected — an unknown
 * value must never reach a branch, least of all the destructive one.
 */
function parseAction(value: unknown): Action | null {
  if (value === undefined || value === null) return 'respond'
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value) ? value as Action : null
}

/**
 * Every membership transition goes through an approved RPC in
 * sql/24-team-roster-integrity-v1.sql; this route never writes team_members directly
 * (UPDATE is revoked from authenticated). Each RPC enforces its own caller rule:
 * respond_team_invite is the invited athlete only, approve/decline_team_request are
 * the team creator, the tournament organizer or an admin, and remove_team_member is
 * those three or the member themself.
 */
export async function PATCH(request: Request, { params }: { params: { memberId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = await request.json().catch(() => null) as Body | null
  const action = parseAction(body?.action)
  if (action === null) {
    return NextResponse.json({ error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 })
  }

  if (action === 'respond') {
    if (typeof body?.status !== 'string' || !['accepted', 'declined'].includes(body.status)) {
      return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
    }
    const { error } = await supabase.rpc('respond_team_invite', { p_member_id: params.memberId, p_status: body.status })
    if (error) {
      if (error.message.includes('INVITE_NOT_FOUND')) {
        return NextResponse.json({ error: 'ไม่พบคำเชิญที่รอตอบรับ อาจถูกตอบไปแล้วหรือถูกยกเลิก' }, { status: 404 })
      }
      return NextResponse.json({ error: 'อัปเดตคำเชิญไม่สำเร็จ' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve' || action === 'decline') {
    const rpc = action === 'approve' ? 'approve_team_request' : 'decline_team_request'
    const { error } = await supabase.rpc(rpc, { p_member_id: params.memberId })
    if (error) {
      if (error.message.includes('TEAM_REQUEST_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'ไม่พบคำขอเข้าทีมที่รออนุมัติ อาจถูกตอบไปแล้ว หรือคุณไม่มีสิทธิ์จัดการทีมนี้' },
          { status: 404 },
        )
      }
      return NextResponse.json({ error: 'อัปเดตคำขอเข้าทีมไม่สำเร็จ' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  // Reached only when action === 'remove'; every other value already returned above.
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 10 || reason.length > 500) {
    // Mirrors the INVALID_REMOVAL_REASON check so the message is specific.
    return NextResponse.json({ error: 'กรุณาระบุเหตุผลการนำออก 10–500 ตัวอักษร' }, { status: 400 })
  }
  const { error } = await supabase.rpc('remove_team_member', { p_member_id: params.memberId, p_reason: reason })
  if (error) {
    if (error.message.includes('INVALID_REMOVAL_REASON')) {
      return NextResponse.json({ error: 'กรุณาระบุเหตุผลการนำออก 10–500 ตัวอักษร' }, { status: 400 })
    }
    if (error.message.includes('ACTIVE_MEMBERSHIP_NOT_FOUND')) {
      return NextResponse.json(
        { error: 'ไม่พบสมาชิกที่เข้าร่วมอยู่ อาจถูกนำออกไปแล้ว หรือคุณไม่มีสิทธิ์จัดการทีมนี้' },
        { status: 404 },
      )
    }
    return NextResponse.json({ error: 'นำสมาชิกออกไม่สำเร็จ' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
