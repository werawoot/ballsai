import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Teams the signed-in athlete may ask to join.
 *
 * `teams` SELECT is deliberately closed to non-owners, so discovery goes through
 * `list_joinable_teams()` (sql/25-team-discovery-v1.sql): security definer, read-only,
 * and it returns only a team's id/name and its tournament's name — never created_by,
 * members, payment or contact data. Until that file is applied the route answers 503
 * with instructions, the same way team registration does when its RPC is missing.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const { data, error } = await supabase.rpc('list_joinable_teams')
  if (error) {
    const missingFunction = error.code === '42883' || error.message.includes('list_joinable_teams')
    return NextResponse.json(
      { error: missingFunction ? 'ระบบค้นหาทีมยังไม่ได้อัปเดต กรุณาติดต่อผู้ดูแลระบบ' : 'โหลดรายชื่อทีมไม่สำเร็จ' },
      { status: missingFunction ? 503 : 500 },
    )
  }
  return NextResponse.json({ teams: data ?? [] })
}
