import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { saveFixtureWinner } from '@/lib/fixture-draw'

// Names the winner of a drawn knockout match (penalties). set_fixture_winner_safely
// (sql/56) decides who may and that the match really was drawn.
export async function POST(request: Request, { params }: { params: { tournamentId: string } }) {
  const rateLimit = await checkRateLimit(request, { scope: 'tournament-fixture-winner', limit: 20, windowSeconds: 60 })
  if (!rateLimit.allowed) return apiError('fixturesRateLimited', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)

  const body = await request.json().catch(() => null) as { fixtureKey?: unknown; winnerTeamId?: unknown } | null
  const fixtureKey = typeof body?.fixtureKey === 'string' && /^[A-Z0-9-]{1,40}$/.test(body.fixtureKey) ? body.fixtureKey : null
  const winnerTeamId = typeof body?.winnerTeamId === 'string' && /^[0-9a-f-]{36}$/i.test(body.winnerTeamId) ? body.winnerTeamId : null
  if (!fixtureKey || !winnerTeamId) return apiError('fixtureWinnerInvalid', 400)

  const result = await saveFixtureWinner(supabase, params.tournamentId, fixtureKey, winnerTeamId)
  if (!result.ok) return apiError(result.code, result.status)
  revalidatePath(`/dashboard/tournaments/${params.tournamentId}/fixtures`)
  return NextResponse.json({ ok: true })
}
