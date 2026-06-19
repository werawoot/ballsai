import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type CreateTeamBody = {
  name?: string
  members?: string
}

type TournamentRecord = {
  id: string
  status: string
  max_teams: number | null
}

export async function POST(
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

  const body = (await request.json()) as CreateTeamBody
  const name = body.name?.trim()
  const members = body.members?.trim()

  if (!name || !members) {
    return NextResponse.json({ error: 'กรุณากรอกชื่อทีมและรายชื่อผู้เล่นให้ครบ' }, { status: 400 })
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, status, max_teams')
    .eq('id', params.tournamentId)
    .single()

  if (tournamentError || !tournament) {
    return NextResponse.json({ error: 'ไม่พบรายการแข่งขัน' }, { status: 404 })
  }

  const typedTournament = tournament as TournamentRecord

  if (typedTournament.status !== 'open') {
    return NextResponse.json({ error: 'รายการนี้ปิดรับสมัครแล้ว' }, { status: 400 })
  }

  const { count } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', params.tournamentId)

  if (
    typedTournament.max_teams !== null &&
    count !== null &&
    count >= typedTournament.max_teams
  ) {
    return NextResponse.json({ error: 'รายการนี้เต็มแล้ว' }, { status: 400 })
  }

  const { data: existingTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', params.tournamentId)
    .eq('created_by', user.id)
    .maybeSingle()

  if (existingTeam) {
    return NextResponse.json({ error: 'คุณสมัครรายการนี้ไว้แล้ว' }, { status: 409 })
  }

  const { data: team, error: insertError } = await supabase
    .from('teams')
    .insert({
      name,
      members,
      tournament_id: params.tournamentId,
      created_by: user.id,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !team) {
    return NextResponse.json({ error: insertError?.message ?? 'สร้างทีมไม่สำเร็จ' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, teamId: team.id })
}
