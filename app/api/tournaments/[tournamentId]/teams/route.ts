import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'

type CreateTeamBody = {
  name?: string
  members?: string
}

export async function POST(
  request: Request,
  { params }: { params: { tournamentId: string } }
) {
  const rateLimit = await checkRateLimit(request, { scope: 'team-registration', limit: 5, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as CreateTeamBody | null
  const name = body?.name?.trim()
  const members = body?.members?.trim()

  if (!name || !members) {
    return NextResponse.json({ error: 'กรุณากรอกชื่อทีมและรายชื่อผู้เล่นให้ครบ' }, { status: 400 })
  }

  const { data: teamId, error } = await supabase.rpc('register_team_safely', {
    p_tournament_id: params.tournamentId,
    p_name: name,
    p_members: members,
  })

  if (error || !teamId) {
    logServerError({
      event: 'team_registration_failed',
      userId: user.id,
      route: '/api/tournaments/[tournamentId]/teams',
      metadata: { tournamentId: params.tournamentId, code: error?.code },
      error,
    })

    const message = error?.message ?? 'สมัครทีมไม่สำเร็จ'
    if (message.includes('TOURNAMENT_NOT_FOUND')) return NextResponse.json({ error: 'ไม่พบรายการแข่งขัน' }, { status: 404 })
    if (message.includes('ALREADY_REGISTERED') || error?.code === '23505') return NextResponse.json({ error: 'คุณสมัครรายการนี้ไว้แล้ว' }, { status: 409 })
    if (message.includes('TOURNAMENT_FULL')) return NextResponse.json({ error: 'รายการนี้เต็มแล้ว' }, { status: 409 })
    if (message.includes('TOURNAMENT_CLOSED')) return NextResponse.json({ error: 'รายการนี้ปิดรับสมัครแล้ว' }, { status: 400 })
    return NextResponse.json({ error: 'ระบบสมัครทีมยังไม่ได้อัปเดต กรุณาติดต่อผู้ดูแลระบบ' }, { status: 503 })
  }

  logServerEvent({
    event: 'team_registered',
    userId: user.id,
    route: '/api/tournaments/[tournamentId]/teams',
    metadata: { tournamentId: params.tournamentId, teamId },
  })

  return NextResponse.json({ ok: true, teamId })
}
