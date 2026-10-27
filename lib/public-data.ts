import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import { fetchPublicTournamentsPage, type TournamentSort, type TournamentView } from './public-tournaments'
import { fetchIdentityRanking, type IdentityRanking } from './public-identity-ranking'
import { fetchRankingProvinces } from './ranking-provinces'
import { fetchRankingPage } from './public-ranking-page'
import type { HomeStats } from './home-stats'
import { fetchPublicPlayer, type PublicPlayerPage } from './public-player'

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

// One page of one tab of the public tournament list. unstable_cache keys on the
// arguments, so each tab, page, search, order and day is cached on its own: `today` in the
// key turns the cache over at midnight Bangkok time, when a finished tournament moves to
// "past".
export const getPublicTournamentsPage = unstable_cache(
  async (page: number, view: TournamentView, today: string, query = '', sort?: TournamentSort) => {
    try {
      return await fetchPublicTournamentsPage(publicSupabase, { page, view, today, query, sort })
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_tournaments_fetch_failed', page, view, error: publicDataErrorDetails(error) }))
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

// One page of the overall /ranking table (T46). Cached per filters and page.
export const getPublicRankingPage = unstable_cache(
  async (filters: RankingFilters & { page: number }) => {
    try {
      return await fetchRankingPage(publicSupabase, filters)
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_ranking_page_fetch_failed', page: filters.page, error: publicDataErrorDetails(error) }))
      return { rows: [], hasNext: false, firstRank: (filters.page - 1) * 50 + 1 }
    }
  },
  ['public-ranking-page'],
  { revalidate: 60, tags: ['public-ranking'] },
)

// One name per province with ranked athletes (sql/59), never the whole ranking table.
export const getPublicRankingProvinces = unstable_cache(
  async (sport: string, season: string): Promise<string[]> => {
    try {
      return await fetchRankingProvinces(publicSupabase, sport, season)
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'public_ranking_provinces_fetch_failed', error: publicDataErrorDetails(error) }))
      return []
    }
  },
  ['public-ranking-provinces-v2'],
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

// Tournament ids for sitemap.xml, newest first. One sitemap holds at most 50,000 URLs
// (sitemaps.org); past that it must become a sitemap index, so reaching the limit is logged
// rather than silently cut.
export const SITEMAP_TOURNAMENT_LIMIT = 49_000
export const getSitemapTournamentIds = unstable_cache(
  async (): Promise<string[]> => {
    try {
      const { data, error } = await publicSupabase
        .from('tournaments')
        .select('id')
        .neq('status', 'draft')
        .order('start_date', { ascending: false })
        .limit(SITEMAP_TOURNAMENT_LIMIT)
      if (error) throw error
      const ids = (data ?? []).map(row => String(row.id))
      if (ids.length >= SITEMAP_TOURNAMENT_LIMIT) console.error(JSON.stringify({ level: 'warn', event: 'sitemap_tournament_limit_reached', limit: SITEMAP_TOURNAMENT_LIMIT }))
      return ids
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'sitemap_tournaments_fetch_failed', error: publicDataErrorDetails(error) }))
      return []
    }
  },
  ['sitemap-tournament-ids'],
  { revalidate: 3600, tags: ['public-tournaments'] },
)

// The home page platform numbers (lib/home-stats.ts). Head-only counts of public rows,
// cached for ten minutes, so a busy home page counts each table six times an hour at
// most, whatever its traffic. A count that fails comes back as NaN and hides the block.
export const getPublicPlatformCounts = unstable_cache(
  async (today: string): Promise<HomeStats> => {
    const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
      const { count: value, error } = await query
      if (error) {
        console.error(JSON.stringify({ level: 'error', event: 'public_platform_count_failed', error: publicDataErrorDetails(error) }))
        return Number.NaN
      }
      return value ?? 0
    }
    const [tournaments, openTournaments, athletes, results] = await Promise.all([
      count(publicSupabase.from('tournaments').select('id', { count: 'exact', head: true })),
      count(publicSupabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('status', 'open').gte('end_date', today)),
      count(publicSupabase.from('player_ranks').select('id', { count: 'exact', head: true }).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON)),
      count(publicSupabase.from('match_results').select('id', { count: 'exact', head: true }).eq('status', 'confirmed')),
    ])
    return { tournaments, openTournaments, athletes, results }
  },
  ['public-platform-counts'],
  { revalidate: 600, tags: ['public-tournaments', 'public-ranking'] },
)

// The shared copy of a public athlete page (/players/[id]) for viewers with no session,
// read with the anon key so it holds only what RLS shows everyone. Cached for a minute:
// a profile made private drops out of it within that minute, and deleting an athlete's
// data (PDPA) clears it at once: /api/account/delete-athlete-data revalidates the
// public-athletes tag. A
// failed read throws and is not cached.
export const getPublicPlayer = unstable_cache(
  async (id: string): Promise<PublicPlayerPage | null> => fetchPublicPlayer(publicSupabase, id),
  ['public-player'],
  { revalidate: 60, tags: ['public-player', 'public-athletes'] },
)
