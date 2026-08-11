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

type PublicProfile = { user_id: string; birth_date: string | null }
type PublicRank = Record<string, unknown> & { id: string; player_id: string | null; pts: number; rank_change: number; ovr: number }
type PublicRating = { player_id: string; player_rank_id: string | null; goals: number; assists: number; clean_sheets: number; mvps: number; matches_played: number }

async function publicProfileIds() {
  const { data, error } = await publicSupabase.from('athlete_profiles').select('user_id, birth_date').eq('sport', 'football').eq('is_public', true).limit(500)
  if (error) throw error
  return (data ?? []) as PublicProfile[]
}

export const getPublicIdentityRankingData = unstable_cache(
  async () => {
    try {
      const profiles = await publicProfileIds()
      const ids = profiles.map(item => item.user_id)
      if (!ids.length) return { emerging: [] as PublicRank[], performance: [] as Array<PublicRank & PublicRating> }
      const [{ data: ranks, error: ranksError }, { data: ratings, error: ratingsError }] = await Promise.all([
        publicSupabase.from('player_ranks').select('*').eq('sport', 'football').eq('season', '2026').in('player_id', ids).limit(500),
        publicSupabase.from('player_ratings').select('player_id, player_rank_id, goals, assists, clean_sheets, mvps, matches_played').eq('sport', 'football').eq('season', '2026').in('player_id', ids).limit(500),
      ])
      if (ranksError) throw ranksError
      if (ratingsError) throw ratingsError
      const rankRows = (ranks ?? []) as PublicRank[]
      const ratingByRank = new Map(((ratings ?? []) as PublicRating[]).filter(item => item.player_rank_id).map(item => [item.player_rank_id!, item]))
      const now = new Date()
      const emerging = rankRows.filter(rank => {
        const birth = profiles.find(profile => profile.user_id === rank.player_id)?.birth_date
        if (!birth) return false
        const age = now.getFullYear() - new Date(`${birth}T00:00:00`).getFullYear()
        return age < 18
      }).sort((a, b) => b.rank_change - a.rank_change || b.pts - a.pts)
      return { emerging, performance: rankRows.map(rank => ({ ...rank, ...(ratingByRank.get(rank.id) ?? { goals: 0, assists: 0, clean_sheets: 0, mvps: 0, matches_played: 0, player_id: rank.player_id, player_rank_id: rank.id }) })) }
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_identity_ranking_fetch_failed', error: error instanceof Error ? error.message : String(error) }))
      return { emerging: [] as PublicRank[], performance: [] as Array<PublicRank & PublicRating> }
    }
  },
  ['public-identity-ranking-data'],
  { revalidate: 60, tags: ['public-ranking', 'public-athletes'] },
)
