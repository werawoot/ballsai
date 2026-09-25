import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Read back one shortlist row.
 *
 * A POST or DELETE whose response was lost leaves the browser unable to say whether the
 * write landed. This is how it finds out: read-only, one athlete, and the same identity
 * check the writes make. It reports the row the CALLER owns -- `scout_shortlists` is
 * private to its scout by RLS, and the query is scoped to the caller's id as well, so
 * this cannot be used to learn whether anyone else shortlisted an athlete.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const athleteId = new URL(request.url).searchParams.get('athleteId')?.trim()
  if (!athleteId) return NextResponse.json({ error: 'ไม่พบนักกีฬา' }, { status: 400 })

  const { data, error } = await supabase
    .from('scout_shortlists')
    .select('athlete_id, note')
    .eq('scout_id', user.id)
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'อ่านสถานะ Shortlist ไม่สำเร็จ' }, { status: 400 })

  // `saved: false` is a real answer, not a missing one: the row is not there.
  return NextResponse.json({ athleteId, saved: data !== null, note: data?.note ?? '' })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { athleteId?: string; note?: string } | null
  if (!body?.athleteId) return NextResponse.json({ error: 'ไม่พบนักกีฬา' }, { status: 400 })
  const { error } = await supabase.rpc('add_scout_shortlist_safely', { p_athlete_id: body.athleteId, p_note: body.note?.trim() ?? '' })
  if (error) return NextResponse.json({ error: error.message.includes('ATHLETE_NOT_DISCOVERABLE') ? 'นักกีฬารายนี้ไม่ได้เปิดเผยโปรไฟล์แล้ว' : 'บันทึก Shortlist ไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { athleteId?: string } | null
  if (!body?.athleteId) return NextResponse.json({ error: 'ไม่พบนักกีฬา' }, { status: 400 })
  const { error } = await supabase.rpc('remove_scout_shortlist_safely', { p_athlete_id: body.athleteId })
  if (error) return NextResponse.json({ error: 'ลบจาก Shortlist ไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
