import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(_request: Request, { params }: { params: { teamId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const { error } = await supabase.rpc('submit_tournament_team_safely', { p_team_id: params.teamId })
  if (!error) return NextResponse.json({ ok: true })
  if (error.message.includes('ACCEPTED_ROSTER_REQUIRED')) return NextResponse.json({ error: 'ต้องมีนักกีฬาตอบรับอย่างน้อย 1 คนก่อนส่งสมัคร' }, { status: 400 })
  if (error.message.includes('TOURNAMENT_FULL')) return NextResponse.json({ error: 'รายการแข่งขันเต็มแล้ว' }, { status: 409 })
  if (error.message.includes('TOURNAMENT_CLOSED')) return NextResponse.json({ error: 'รายการนี้ปิดรับสมัครแล้ว' }, { status: 400 })
  if (error.message.includes('NOT_ALLOWED')) return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ส่งสมัครทีมนี้' }, { status: 403 })
  return NextResponse.json({ error: 'ส่งสมัครทีมไม่สำเร็จ' }, { status: 400 })
}
