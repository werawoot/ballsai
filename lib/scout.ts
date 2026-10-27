import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalProvince } from '@/lib/thai-provinces'
import { fetchPublicAthletesPage } from '@/lib/public-athletes'

// /scout, one page at a time (T52). public_scout_athletes (sql/94) lists public profiles of
// the sport, highest Power Rating first and athletes with no rating yet after them, and
// applies every filter in the database, so the 151st athlete is as findable as the first.

export const SCOUT_PAGE_SIZE = 24
export const SCOUT_POSITIONS = ['FW', 'MF', 'DF', 'GK'] as const
export const SCOUT_MIN_POWERS = [1000, 1300, 1600] as const
const SEARCH_MAX = 60
// Past this the offset would not fit the database's integer; such an address goes to page 1.
export const SCOUT_MAX_PAGE = 50_000

export type ScoutFilters = { page: number; search: string; province: string | null; position: string | null; minPower: number | null }
export type ScoutAthlete = { user_id: string; display_name: string; position: string | null; province: string | null; current_team: string | null; verification_level: string; power: number | null; player_path: string }
type Row = Omit<ScoutAthlete, 'player_path'> & { rank_id: string | null }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

export function parseScoutFilters(params: Record<string, string | string[] | undefined>): ScoutFilters {
  const page = Number.parseInt(one(params.page), 10)
  const position = one(params.position)
  const minPower = Number(one(params.power))
  return {
    page: Number.isFinite(page) && page > 0 && page <= SCOUT_MAX_PAGE ? page : 1,
    search: one(params.q).trim().slice(0, SEARCH_MAX),
    province: canonicalProvince(one(params.province).trim()),
    position: (SCOUT_POSITIONS as readonly string[]).includes(position) ? position : null,
    minPower: (SCOUT_MIN_POWERS as readonly number[]).includes(minPower) ? minPower : null,
  }
}

export async function fetchScoutPage(client: SupabaseClient, filters: ScoutFilters, { sport, season }: { sport: string; season: string }) {
  const { data, error } = await client.rpc('public_scout_athletes', {
    p_sport: sport,
    p_season: season,
    p_search: filters.search || null,
    p_province: filters.province,
    p_position: filters.position,
    p_min_power: filters.minPower,
    // One row past the page says whether a next page exists, without counting them all.
    p_limit: SCOUT_PAGE_SIZE + 1,
    p_offset: (filters.page - 1) * SCOUT_PAGE_SIZE,
  })
  if (error) {
    if (['PGRST202', '42883'].includes(error.code ?? '')) return fallbackScoutPage(client, filters, { sport, season })
    throw error
  }
  const rows = (data ?? []) as Row[]
  const athletes = rows.slice(0, SCOUT_PAGE_SIZE).map(({ rank_id: rankId, ...athlete }) => ({ ...athlete, player_path: `/players/${rankId ?? athlete.user_id}` }))
  return { athletes, hasNext: rows.length > SCOUT_PAGE_SIZE, byRating: true }
}

// Before sql/94: the /athletes directory, newest first, with name, province and position
// still filtered and paged in the database (24 a page, as /athletes does). It cannot sort by
// rating or filter a minimum rating, so the page says so (byRating false).
async function fallbackScoutPage(client: SupabaseClient, filters: ScoutFilters, { sport, season }: { sport: string; season: string }) {
  const { athletes, ranks, hasNext } = await fetchPublicAthletesPage(client, {
    page: filters.page, sport, season,
    search: filters.search || undefined, province: filters.province ?? undefined, position: filters.position ?? undefined,
  })
  const rankByPlayer = new Map(ranks.map(rank => [rank.player_id, rank]))
  return {
    athletes: athletes.map(athlete => {
      const rank = rankByPlayer.get(athlete.user_id)
      return {
        user_id: athlete.user_id, display_name: athlete.display_name, position: athlete.position ?? null, province: athlete.province ?? null,
        current_team: athlete.current_team ?? null, verification_level: athlete.verification_level, power: rank?.pts ?? null,
        player_path: `/players/${rank?.id ?? athlete.user_id}`,
      } satisfies ScoutAthlete
    }),
    hasNext,
    byRating: false,
  }
}
