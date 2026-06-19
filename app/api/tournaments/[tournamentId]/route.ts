import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'

type UpdateTournamentBody = {
  name?: string
  description?: string
  location?: string
  startDate?: string
  endDate?: string
  fee?: number
  promptpay?: string
  maxTeams?: number
  status?: 'open' | 'closed'
}

type TournamentOwner = {
  organizer_id: string
}

export async function PATCH(
  request: Request,
  { params }: { params: { tournamentId: string } }
) {
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
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขรายการแข่งขัน' }, { status: 403 })
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('organizer_id')
    .eq('id', params.tournamentId)
    .single()

  if (tournamentError || !tournament) {
    return NextResponse.json({ error: 'ไม่พบรายการแข่งขัน' }, { status: 404 })
  }

  const typedTournament = tournament as TournamentOwner
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin && typedTournament.organizer_id !== user.id) {
    return NextResponse.json({ error: 'แก้ไขได้เฉพาะรายการของคุณ' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as UpdateTournamentBody | null
  if (!body) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const update: Record<string, string | number> = {}

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'กรุณากรอกชื่อรายการ' }, { status: 400 })
    update.name = name
  }

  if (body.description !== undefined) update.description = body.description.trim()

  if (body.location !== undefined) {
    const location = body.location.trim()
    if (!location) return NextResponse.json({ error: 'กรุณากรอกสถานที่' }, { status: 400 })
    update.location = location
  }

  if (body.startDate !== undefined) {
    const startDate = body.startDate.trim()
    if (!startDate) return NextResponse.json({ error: 'กรุณากรอกวันที่แข่ง' }, { status: 400 })
    update.start_date = startDate
  }

  if (body.endDate !== undefined) update.end_date = body.endDate.trim() || (update.start_date as string | undefined) || ''

  if (body.fee !== undefined) {
    const fee = Number(body.fee)
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: 'ค่าสมัครต้องเป็นเลข 0 ขึ้นไป' }, { status: 400 })
    }
    update.fee = fee
  }

  if (body.promptpay !== undefined) update.promptpay = body.promptpay.trim()

  if (body.maxTeams !== undefined) {
    const maxTeams = Number(body.maxTeams)
    if (!Number.isFinite(maxTeams) || maxTeams < 2) {
      return NextResponse.json({ error: 'จำนวนทีมสูงสุดต้องไม่น้อยกว่า 2 ทีม' }, { status: 400 })
    }
    update.max_teams = Math.floor(maxTeams)
  }

  if (body.status !== undefined) {
    if (body.status !== 'open' && body.status !== 'closed') {
      return NextResponse.json({ error: 'สถานะรายการไม่ถูกต้อง' }, { status: 400 })
    }
    update.status = body.status
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อมูลที่ต้องอัปเดต' }, { status: 400 })
  }

  const { error } = await supabase
    .from('tournaments')
    .update(update)
    .eq('id', params.tournamentId)

  if (error) {
    logServerError({
      event: 'tournament_update_failed',
      userId: user.id,
      route: '/api/tournaments/[tournamentId]',
      metadata: { tournamentId: params.tournamentId, fields: Object.keys(update) },
      error,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  logServerEvent({
    event: 'tournament_updated',
    userId: user.id,
    route: '/api/tournaments/[tournamentId]',
    metadata: { tournamentId: params.tournamentId, fields: Object.keys(update) },
  })

  return NextResponse.json({ ok: true })
}
