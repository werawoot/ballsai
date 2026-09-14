import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type CourtBody = { name?: string; sport?: 'football' | 'futsal'; surface?: string; capacity?: number | null }

export async function POST(request: Request, { params }: { params: { venueId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as CourtBody | null
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: 'กรอกชื่อพื้นที่เล่น' }, { status: 400 })
  const capacity = body?.capacity == null ? null : Number(body.capacity)
  const { data, error } = await supabase.rpc('create_venue_court_safely', {
    p_venue_id: params.venueId,
    p_name: name,
    p_sport: body?.sport === 'futsal' ? 'futsal' : 'football',
    p_surface: body?.surface?.trim() ?? '',
    p_capacity: Number.isFinite(capacity) ? capacity : null,
  })
  if (error) return NextResponse.json({ error: 'เพิ่มพื้นที่เล่นไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true, courtId: data })
}
