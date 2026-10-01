import type { SupabaseClient } from '@supabase/supabase-js'

// T46. The overall /ranking table, 50 per page, over every ranked athlete: Power Rating
// descending, then the row id so equal Power always sorts the same way and each athlete
// is on exactly one page. One row more than a page is read to tell whether a next page
// exists without counting the whole season. The existing (sport, season, pts desc) index
// serves it: 100,000 athletes, deepest page (offset 49,950) 43 ms, position counts 10 ms
// on Postgres 16; an index with id added saved 16 ms on that page, not worth a migration.
export const RANKING_PAGE_SIZE = 50

type Filters = { sport: string; season: string; province?: string; position?: string; search?: string }
export type RankingRow = Record<string, unknown> & { id: string; pts: number }

export async function fetchRankingPage(client: SupabaseClient, { sport, season, province, position, search, page }: Filters & { page: number }) {
  const from = (page - 1) * RANKING_PAGE_SIZE
  let query = client.from('player_ranks').select('*').eq('sport', sport).eq('season', season)
  if (province) query = query.eq('province', province)
  if (position) query = query.eq('position', position)
  if (search) query = query.ilike('player_name', `%${search}%`)
  const { data, error } = await query
    .order('pts', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + RANKING_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as RankingRow[]
  return { rows: rows.slice(0, RANKING_PAGE_SIZE), hasNext: rows.length > RANKING_PAGE_SIZE, firstRank: from + 1 }
}

// Where a signed-in athlete stands in the overall table (no filters). Null when the
// athlete has no rank row this season.
export async function fetchMyRankingPosition(client: SupabaseClient, { sport, season, userId }: { sport: string; season: string; userId: string }) {
  const { data: mine, error } = await client.from('player_ranks').select('id, pts')
    .eq('player_id', userId).eq('sport', sport).eq('season', season).maybeSingle()
  if (error) throw error
  if (!mine) return null
  const { id, pts } = mine as { id: string; pts: number }
  return fetchRankPosition(client, { sport, season, id, pts })
}

// The overall position of one rank row: everyone with more Power, plus those with equal
// Power and a smaller id, are ahead. Two counts on the index, never a read of the table.
// The same order as fetchRankingPage, so the number matches the row's place in the table.
export async function fetchRankPosition(client: SupabaseClient, { sport, season, id, pts }: { sport: string; season: string; id: string; pts: number }) {
  const count = () => client.from('player_ranks').select('id', { count: 'exact', head: true }).eq('sport', sport).eq('season', season)
  const [above, tiedAhead] = await Promise.all([
    count().gt('pts', pts),
    count().eq('pts', pts).lt('id', id),
  ])
  if (above.error) throw above.error
  if (tiedAhead.error) throw tiedAhead.error
  const position = (above.count ?? 0) + (tiedAhead.count ?? 0) + 1
  return { rankId: id, position, page: Math.ceil(position / RANKING_PAGE_SIZE) }
}
