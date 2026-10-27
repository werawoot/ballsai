import type { SupabaseClient } from '@supabase/supabase-js'

// The ดาวรุ่ง and MVP tabs on /ranking show the top athletes among public profiles only.
// public_athlete_rankings (sql/52) joins player_ranks, public athlete_profiles and
// player_ratings in the database, so the database sorts and cuts the list: the result is
// correct at any number of athletes. The view carries an under_18 flag, never a birth date.
export const IDENTITY_RANKING_LIMIT = 50

const COLUMNS = 'id, player_id, player_name, team, province, position, sport, season, ovr, pts, pac, sho, pas, dri, def, rank_change, under_18, goals, assists, clean_sheets, mvps, matches_played'

type Stats = { goals: number; assists: number; clean_sheets: number; mvps: number; matches_played: number }
export type IdentityRankingRow = Record<string, unknown> & Stats & {
  id: string
  player_id: string | null
  pts: number
  rank_change: number
  ovr: number
  under_18: boolean
}
export type IdentityRanking = { emerging: IdentityRankingRow[]; performance: IdentityRankingRow[] }

type Options = { sport: string; season: string }

export async function fetchIdentityRanking(client: SupabaseClient, options: Options): Promise<IdentityRanking> {
  const { sport, season } = options
  const view = () => client.from('public_athlete_rankings').select(COLUMNS).eq('sport', sport).eq('season', season)
  const [emerging, performance] = await Promise.all([
    view().eq('under_18', true)
      .order('rank_change', { ascending: false })
      .order('pts', { ascending: false })
      .order('id', { ascending: true })
      .limit(IDENTITY_RANKING_LIMIT),
    view()
      .order('mvps', { ascending: false })
      .order('goals', { ascending: false })
      .order('pts', { ascending: false })
      .order('id', { ascending: true })
      .limit(IDENTITY_RANKING_LIMIT),
  ])
  if (emerging.error) throw emerging.error
  if (performance.error) throw performance.error
  return {
    emerging: (emerging.data ?? []) as unknown as IdentityRankingRow[],
    performance: (performance.data ?? []) as unknown as IdentityRankingRow[],
  }
}
