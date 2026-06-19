import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type TeamStatusBody = {
  status?: 'confirmed' | 'rejected'
}

type TeamQueryResult = {
  id: string
  name: string
  created_by: string
  tournaments: { name: string; organizer_id: string } | { name: string; organizer_id: string }[] | null
  profiles: { email: string | null } | { email: string | null }[] | null
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function POST(
  request: Request,
  { params }: { params: { teamId: string } }
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
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ยืนยันทีม' }, { status: 403 })
  }

  const body = (await request.json()) as TeamStatusBody
  if (body.status !== 'confirmed' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name, created_by, tournaments(name, organizer_id), profiles:created_by(email)')
    .eq('id', params.teamId)
    .single()

  if (teamError || !team) {
    return NextResponse.json({ error: 'ไม่พบทีมที่ต้องการอัปเดต' }, { status: 404 })
  }

  const typedTeam = team as TeamQueryResult
  const tournament = firstRelation(typedTeam.tournaments)
  const teamOwner = firstRelation(typedTeam.profiles)
  const isAdmin = profile?.role === 'admin'
  const organizerId = tournament?.organizer_id

  if (!isAdmin && organizerId !== user.id) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการทีมนี้' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('teams')
    .update({ status: body.status })
    .eq('id', params.teamId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  const email = teamOwner?.email
  if (email) {
    await fetch(new URL('/api/send-email', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName: typedTeam.name,
        tournamentName: tournament?.name,
        email,
        status: body.status,
      }),
    })
  }

  return NextResponse.json({ ok: true })
}
