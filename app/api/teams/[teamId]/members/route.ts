import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET(_request: Request, { params }: { params: { teamId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const { data, error } = await supabase
    .from('team_members')
    .select('id, team_id, athlete_id, status, invited_at, responded_at')
    .eq('team_id', params.teamId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'โหลดสมาชิกทีมไม่สำเร็จ' }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

export async function POST(request: Request, { params }: { params: { teamId: string } }) {
  // invite_team_member answers differently for "no such account", "already a member"
  // and success, which makes an unthrottled endpoint an account-existence oracle for
  // any email — including a child's. The per-(team, athlete) cooldown inside the RPC
  // does not slow down probing *different* addresses, so the caller is throttled here
  // as well. The distinct messages are kept: a manager legitimately needs to know that
  // the athlete has not signed up yet.
  const rateLimit = await checkRateLimit(request, { scope: 'team-invite', limit: 10, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ส่งคำเชิญบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { email?: string } | null
  const email = body?.email?.trim()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'กรุณากรอกอีเมลที่ถูกต้อง' }, { status: 400 })
  const { data, error } = await supabase.rpc('invite_team_member', { p_team_id: params.teamId, p_email: email })
  if (error) {
    // Codes raised by invite_team_member in sql/24-team-roster-integrity-v1.sql.
    if (error.message.includes('USER_NOT_FOUND')) return NextResponse.json({ error: 'ยังไม่มีบัญชีนี้ในระบบ ให้นักกีฬาสมัครก่อนแล้วเชิญอีกครั้ง' }, { status: 404 })
    if (error.message.includes('NOT_ALLOWED')) return NextResponse.json({ error: 'คุณไม่มีสิทธิ์เชิญสมาชิกทีมนี้' }, { status: 403 })
    if (error.message.includes('CANNOT_INVITE_SELF')) return NextResponse.json({ error: 'ไม่สามารถเชิญบัญชีตัวเองได้' }, { status: 400 })
    if (error.message.includes('TEAM_NOT_FOUND')) return NextResponse.json({ error: 'ไม่พบทีมนี้' }, { status: 404 })
    if (error.message.includes('ACTIVE_MEMBERSHIP_EXISTS')) return NextResponse.json({ error: 'นักกีฬาคนนี้อยู่ในทีมหรือมีคำเชิญค้างอยู่แล้ว' }, { status: 409 })
    if (error.message.includes('TEAM_MEMBERSHIP_RATE_LIMITED')) return NextResponse.json({ error: 'เพิ่งส่งคำเชิญให้บัญชีนี้ไป กรุณารอ 10 นาทีแล้วลองใหม่' }, { status: 429 })
    return NextResponse.json({ error: 'ส่งคำเชิญไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, memberId: data })
}
