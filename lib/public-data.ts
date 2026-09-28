import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import { fetchPublicTournamentsPage } from './public-tournaments'
import { fetchIdentityRanking, type IdentityRanking } from './public-identity-ranking'

const publicSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type RankingFilters = {
  sport: string
  season: string
  province?: string
  position?: string
  search?: string
}

type PublicDataError = {
  code?: string
  details?: string
  hint?: string
  message?: string
}

function publicDataErrorDetails(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const { code, details, hint, message } = error as PublicDataError
    return { code, details, hint, message }
  }
  return String(error)
}

// One page of the public tournament list. unstable_cache keys on the arguments, so each
// page is cached on its own.
export const getPublicTournamentsPage = unstable_cache(
  async (page: number) => {
    try {
      return await fetchPublicTournamentsPage(publicSupabase, { page })
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_tournaments_fetch_failed', page, error: publicDataErrorDetails(error) }))
      return { tournaments: [], hasNext: false }
    }
  },
  ['public-tournaments-page'],
  { revalidate: 60, tags: ['public-tournaments'] },
)

export const getPublicOpenTournaments = unstable_cache(
  async () => {
    try {
      const { data, error } = await publicSupabase
        .from('tournaments')
        .select('*')
        .eq('status', 'open')
        .order('start_date', { ascending: true })
        .limit(6)
      if (error) throw error
      return data
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_open_tournaments_fetch_failed', error: publicDataErrorDetails(error) }))
      return []
    }
  },
  ['public-open-tournaments'],
  { revalidate: 60, tags: ['public-tournaments'] },
)

export const getPublicRankings = unstable_cache(
  async ({ sport, season, province = '', position = '', search = '' }: RankingFilters) => {
    try {
      let query = publicSupabase
        .from('player_ranks')
        .select('*')
        .eq('sport', sport)
        .eq('season', season)
        .order('pts', { ascending: false })
      if (province) query = query.eq('province', province)
      if (position) query = query.eq('position', position)
      if (search) query = query.ilike('player_name', `%${search}%`)
      const { data, error } = await query.limit(50)
      if (error) throw error
      return data
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_rankings_fetch_failed', error: publicDataErrorDetails(error) }))
      return []
    }
  },
  ['public-rankings'],
  { revalidate: 60, tags: ['public-ranking'] },
)

export const getPublicRankingProvinces = unstable_cache(
  async (sport: string, season: string) => {
    try {
      const { data, error } = await publicSupabase
        .from('player_ranks')
        .select('province')
        .eq('sport', sport)
        .eq('season', season)
        .order('province')
      if (error) throw error
      return data
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_ranking_provinces_fetch_failed', error: publicDataErrorDetails(error) }))
      return []
    }
  },
  ['public-ranking-provinces'],
  { revalidate: 60, tags: ['public-ranking'] },
)

export const getPublicIdentityRankingData = unstable_cache(
  async (): Promise<IdentityRanking> => {
    try {
      return await fetchIdentityRanking(publicSupabase, { sport: ACTIVE_SPORT, season: ACTIVE_SEASON })
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_identity_ranking_fetch_failed', error: publicDataErrorDetails(error) }))
      return { emerging: [], performance: [] }
    }
  },
  ['public-identity-ranking-data'],
  { revalidate: 60, tags: ['public-ranking', 'public-athletes'] },
)
