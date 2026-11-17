import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { checkAddressRateLimit, checkUserRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { saveFixturesPublished } from '@/lib/fixture-draw'

// Per account, behind a ceiling per address of ADDRESS_CEILING_MULTIPLIER times this (lib/rate-limit.ts, T65).
const RATE_LIMIT = { scope: 'tournament-fixtures-publish', limit: 20, windowSeconds: 60 }

// Shows or hides a tournament's draw to everyone. set_fixtures_published_safely (sql/57)
// decides who may.
export async function POST(request: Request, props: { params: Promise<{ tournamentId: string }> }) {
  const params = await props.params
  const rateLimit = await checkAddressRateLimit(request, RATE_LIMIT)
  if (!rateLimit.allowed) return apiError('fixturesRateLimited', 429, { retryAfter: String(rateLimit.retryAfterSeconds) })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const userRateLimit = await checkUserRateLimit(user.id, RATE_LIMIT)
  if (!userRateLimit.allowed) return apiError('fixturesRateLimited', 429, { retryAfter: String(userRateLimit.retryAfterSeconds) })

  const body = await request.json().catch(() => null) as { published?: unknown } | null
  if (typeof body?.published !== 'boolean') return apiError('fixturesRequestInvalid', 400)

  const result = await saveFixturesPublished(supabase, params.tournamentId, body.published)
  if (!result.ok) return apiError(result.code, result.status)
  revalidatePath(`/dashboard/tournaments/${params.tournamentId}/fixtures`)
  revalidatePath(`/tournaments/${params.tournamentId}/fixtures`)
  return NextResponse.json({ published: body.published })
}
