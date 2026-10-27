import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalProvince } from '@/lib/thai-provinces'

// /scout, one page at a time (T52). public_scout_athletes (sql/94) lists public profiles of
// the sport, highest Power Rating first and athletes with no rating yet after them, and
// applies every filter in the database, so the 151st athlete is as findable as the first.

export const SCOUT_PAGE_SIZE = 24
export const SCOUT_POSITIONS = ['FW', 'MF', 'DF', 'GK'] as const
export const SCOUT_MIN_POWERS = [1000, 1300, 1600] as const
const SEARCH_MAX = 60

export type ScoutFilters = { page: number; search: string; province: string | null; position: string | null; minPower: number | null }
export type ScoutAthlete = { user_id: string; display_name: string; position: string | null; province: string | null; current_team: string | null; verification_level: string; power: number | null; player_path: string }
type Row = Omit<ScoutAthlete, 'player_path'> & { rank_id: string | null }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

export function parseScoutFilters(params: Record<string, string | string[] | undefined>): ScoutFilters {
  const page = Number.parseInt(one(params.page), 10)
  const position = one(params.position)
  const minPower = Number(one(params.power))
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
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
    if (['PGRST202', '42883'].includes(error.code ?? '')) return { athletes: [] as ScoutAthlete[], hasNext: false, notReady: true }
    throw error
  }
  const rows = (data ?? []) as Row[]
  const athletes = rows.slice(0, SCOUT_PAGE_SIZE).map(({ rank_id: rankId, ...athlete }) => ({ ...athlete, player_path: `/players/${rankId ?? athlete.user_id}` }))
  return { athletes, hasNext: rows.length > SCOUT_PAGE_SIZE, notReady: false }
}
