import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'

export const dynamic = 'force-dynamic'

type AthleteRow = {
  user_id: string
  display_name: string
  current_team: string | null
  province: string | null
  position: string | null
}

function safeSearch(value: string | null) {
  return (value ?? '').trim().replace(/[%_,]/g, '').slice(0, 80)
}

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'admin-athlete-search', limit: 90, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 })

  const url = new URL(request.url)
  const query = safeSearch(url.searchParams.get('q'))
  const unlinkedOnly = url.searchParams.get('unlinked') === '1'
  let athleteQuery = supabase
    .from('athlete_profiles')
    .select('user_id, display_name, current_team, province, position')
    .not('display_name', 'is', null)
    .order('display_name', { ascending: true })
    .limit(60)
  if (query) athleteQuery = athleteQuery.ilike('display_name', `%${query}%`)

  const { data, error } = await athleteQuery
  if (error) return NextResponse.json({ error: 'โหลดบัญชีนักกีฬาไม่สำเร็จ' }, { status: 500 })

  const rows = (data ?? []) as AthleteRow[]
  const ids = rows.map(row => row.user_id)
  const { data: ranks, error: ranksError } = ids.length
    ? await supabase
      .from('player_ranks')
      .select('player_id')
      .eq('sport', ACTIVE_SPORT)
      .eq('season', ACTIVE_SEASON)
      .in('player_id', ids)
    : { data: [], error: null }
  if (ranksError) return NextResponse.json({ error: 'ตรวจ Ranking ไม่สำเร็จ' }, { status: 500 })

  const rankedIds = new Set((ranks ?? []).map(rank => rank.player_id as string))
  const accounts = rows
    .map(row => ({ ...row, hasRanking: rankedIds.has(row.user_id) }))
    .filter(row => !unlinkedOnly || !row.hasRanking)
    .slice(0, 20)

  return NextResponse.json({ accounts, query }, { headers: { 'Cache-Control': 'private, no-store' } })
}
