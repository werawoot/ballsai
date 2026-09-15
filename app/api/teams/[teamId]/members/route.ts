import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { email?: string } | null
  const email = body?.email?.trim()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'กรุณากรอกอีเมลที่ถูกต้อง' }, { status: 400 })
  const { data, error } = await supabase.rpc('invite_team_member', { p_team_id: params.teamId, p_email: email })
  if (error) {
    if (error.message.includes('USER_NOT_FOUND')) return NextResponse.json({ error: 'ยังไม่มีบัญชีนี้ในระบบ' }, { status: 404 })
    if (error.message.includes('NOT_ALLOWED')) return NextResponse.json({ error: 'คุณไม่มีสิทธิ์เชิญสมาชิกทีมนี้' }, { status: 403 })
    if (error.message.includes('CANNOT_INVITE_SELF')) return NextResponse.json({ error: 'ไม่สามารถเชิญบัญชีตัวเองได้' }, { status: 400 })
    return NextResponse.json({ error: 'ส่งคำเชิญไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, memberId: data })
}
