import type { SupabaseClient } from '@supabase/supabase-js'

export const HALL_PAGE_SIZE = 24

const COLUMNS = 'id, season, category, age_group, province, athlete_id, player_rank_id, athlete_name, team_name, position, image_url, citation'

type Options = { season: string; page: number; category?: string; age?: string; province?: string }

// One page of a season's Hall of Fame, newest honour first. One row more than a page is
// read to tell whether a next page exists without counting the whole season. The filters
// run in the database, before it pages, so every page is full.
export async function fetchHallPage(client: SupabaseClient, { season, page, category, age, province }: Options) {
  const from = (page - 1) * HALL_PAGE_SIZE
  let query = client.from('hall_of_fame_entries').select(COLUMNS).eq('season', season)
  if (category) query = query.eq('category', category)
  if (age) query = query.eq('age_group', age)
  if (province) query = query.eq('province', province)
  const { data, error } = await query
    .order('awarded_at', { ascending: false })
    // Honours announced in the same instant have no defined order; the unique tiebreak
    // keeps every entry on exactly one page.
    .order('id', { ascending: true })
    .range(from, from + HALL_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return { entries: rows.slice(0, HALL_PAGE_SIZE), hasNext: rows.length > HALL_PAGE_SIZE }
}
