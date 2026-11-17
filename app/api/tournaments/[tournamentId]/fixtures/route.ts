import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { checkAddressRateLimit, checkUserRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseDrawRequest, saveTournamentDraw } from '@/lib/fixture-draw'

// Per account, behind a ceiling per address of ADDRESS_CEILING_MULTIPLIER times this (lib/rate-limit.ts, T65).
const RATE_LIMIT = { scope: 'tournament-fixtures', limit: 10, windowSeconds: 60 }

// Makes (or remakes) a tournament's draw. The server builds the fixtures from the
// tournament's confirmed teams; save_tournament_fixtures_safely (sql/55) decides who may.
export async function POST(request: Request, props: { params: Promise<{ tournamentId: string }> }) {
  const params = await props.params
  const rateLimit = await checkAddressRateLimit(request, RATE_LIMIT)
  if (!rateLimit.allowed) return apiError('fixturesRateLimited', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const userRateLimit = await checkUserRateLimit(user.id, RATE_LIMIT)
  if (!userRateLimit.allowed) return apiError('fixturesRateLimited', 429, { retryAfter: String(userRateLimit.retryAfterSeconds) })

  const draw = parseDrawRequest(await request.json().catch(() => null))
  if ('error' in draw) return apiError(draw.error, 400)

  const result = await saveTournamentDraw(supabase, params.tournamentId, draw)
  if (!result.ok) return apiError(result.code, result.status)

  revalidatePath(`/dashboard/tournaments/${params.tournamentId}/fixtures`)
  return NextResponse.json({ count: result.count })
}
