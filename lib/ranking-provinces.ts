import type { SupabaseClient } from '@supabase/supabase-js'
import { PROVINCE_NAMES_EN } from '@/lib/thai-provinces'

// The provinces offered by the /ranking filter: those that have ranked athletes this
// season. public_ranking_provinces (sql/59) answers one row per province, so the list is
// complete at any number of athletes. Before SQL59 every Thai province is offered rather
// than reading the whole ranking table, which PostgREST would cut at 1000 rows.

const isMissingView = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01'
const ALL_PROVINCES = Object.keys(PROVINCE_NAMES_EN).sort((a, b) => a.localeCompare(b, 'th'))

export async function fetchRankingProvinces(client: SupabaseClient, sport: string, season: string): Promise<string[]> {
  const { data, error } = await client.from('public_ranking_provinces').select('province').eq('sport', sport).eq('season', season).order('province')
  if (isMissingView(error)) return ALL_PROVINCES
  if (error) throw error
  // The stored spelling is kept: the filter matches it exactly.
  return ((data ?? []) as { province: string | null }[]).flatMap(row => row.province?.trim() ? [row.province] : [])
}
