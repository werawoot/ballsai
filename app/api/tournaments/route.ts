import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type CreateTournamentBody = {
  name?: string
  description?: string
  location?: string
  startDate?: string
  endDate?: string
  fee?: number
  promptpay?: string
  maxTeams?: number
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'organizer' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างรายการแข่งขัน' }, { status: 403 })
  }

  const body = (await request.json()) as CreateTournamentBody
  const name = body.name?.trim()
  const location = body.location?.trim()
  const startDate = body.startDate?.trim()
  const endDate = body.endDate?.trim() || startDate
  const fee = Number(body.fee)
  const maxTeams = Number(body.maxTeams)

  if (!name || !location || !startDate || !Number.isFinite(fee) || fee < 0) {
    return NextResponse.json({ error: 'ข้อมูลรายการแข่งขันไม่ครบถ้วน' }, { status: 400 })
  }

  if (!Number.isFinite(maxTeams) || maxTeams < 2) {
    return NextResponse.json({ error: 'จำนวนทีมสูงสุดต้องไม่น้อยกว่า 2 ทีม' }, { status: 400 })
  }

  const { error } = await supabase.from('tournaments').insert({
    name,
    description: body.description?.trim() ?? '',
    location,
    start_date: startDate,
    end_date: endDate,
    fee,
    promptpay: body.promptpay?.trim() ?? '',
    max_teams: Math.floor(maxTeams),
    organizer_id: user.id,
    status: 'open',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
