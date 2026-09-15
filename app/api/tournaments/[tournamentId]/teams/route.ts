import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'

type CreateTeamBody = {
  name?: string
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

  if (!name) {
    return NextResponse.json({ error: 'กรุณากรอกชื่อทีม' }, { status: 400 })
  }

  const { data: teamId, error } = await supabase.rpc('create_tournament_team_safely', {
    p_tournament_id: params.tournamentId,
    p_name: name,
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
    if (message.includes('ALREADY_HAS_TEAM_FOR_TOURNAMENT') || error?.code === '23505') return NextResponse.json({ error: 'คุณสร้างทีมสำหรับรายการนี้แล้ว' }, { status: 409 })
    if (message.includes('COACH_ORGANIZER_REQUIRED')) return NextResponse.json({ error: 'เฉพาะโค้ชหรือผู้จัดเท่านั้นที่สร้างทีมได้' }, { status: 403 })
    if (message.includes('TOURNAMENT_FULL')) return NextResponse.json({ error: 'รายการนี้เต็มแล้ว' }, { status: 409 })
    if (message.includes('TOURNAMENT_CLOSED')) return NextResponse.json({ error: 'รายการนี้ปิดรับสมัครแล้ว' }, { status: 400 })
    return NextResponse.json({ error: 'ยังไม่พร้อมสร้างทีม กรุณาตรวจว่า migration roster flow ถูก apply แล้ว' }, { status: 503 })
  }

  logServerEvent({
    event: 'tournament_team_drafted',
    userId: user.id,
    route: '/api/tournaments/[tournamentId]/teams',
    metadata: { tournamentId: params.tournamentId, teamId },
  })

  return NextResponse.json({ ok: true, teamId, status: 'draft' })
}
