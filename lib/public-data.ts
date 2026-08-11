import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

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

export const getPublicTournaments = unstable_cache(
  async () => {
    try {
      const { data, error } = await publicSupabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: true })
      if (error) throw error
      return data
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_tournaments_fetch_failed', error: error instanceof Error ? error.message : String(error) }))
      return []
    }
  },
  ['public-tournaments'],
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
      console.error(JSON.stringify({ level: 'error', event: 'public_open_tournaments_fetch_failed', error: error instanceof Error ? error.message : String(error) }))
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
      console.error(JSON.stringify({ level: 'error', event: 'public_rankings_fetch_failed', error: error instanceof Error ? error.message : String(error) }))
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
      console.error(JSON.stringify({ level: 'error', event: 'public_ranking_provinces_fetch_failed', error: error instanceof Error ? error.message : String(error) }))
      return []
    }
  },
  ['public-ranking-provinces'],
  { revalidate: 60, tags: ['public-ranking'] },
)

// Hall of Fame is intentionally stricter than Ranking: youth athletes appear
// here only after their Athlete Profile has been made public by the owner.
export const getPublicHallOfFame = unstable_cache(
  async (province = '') => {
    try {
      let profileQuery = publicSupabase
        .from('athlete_profiles')
        .select('user_id, province')
        .eq('sport', 'football')
        .eq('is_public', true)
      if (province) profileQuery = profileQuery.eq('province', province)
      const { data: profiles, error: profileError } = await profileQuery.limit(250)
      if (profileError) throw profileError
      const athleteIds = (profiles ?? []).map(profile => profile.user_id)
      if (athleteIds.length === 0) return []
      const { data, error } = await publicSupabase
        .from('player_ranks')
        .select('*')
        .eq('sport', 'football')
        .eq('season', '2026')
        .in('player_id', athleteIds)
        .order('pts', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_hall_of_fame_fetch_failed', error: error instanceof Error ? error.message : String(error) }))
      return []
    }
  },
  ['public-hall-of-fame'],
  { revalidate: 60, tags: ['public-ranking', 'public-athletes'] },
)
