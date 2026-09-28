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

type Options = { sport: string; season: string; now?: Date }

// PostgREST answers PGRST205 for a table or view it does not know; Postgres itself 42P01.
const isMissingView = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01'

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
  if (isMissingView(emerging.error) || isMissingView(performance.error)) {
    console.warn(JSON.stringify({ level: 'warn', event: 'public_identity_ranking_view_missing', detail: 'apply sql/52-public-athlete-rankings-view-v1.sql' }))
    return legacyIdentityRanking(client, options)
  }
  if (emerging.error) throw emerging.error
  if (performance.error) throw performance.error
  return {
    emerging: (emerging.data ?? []) as unknown as IdentityRankingRow[],
    performance: (performance.data ?? []) as unknown as IdentityRankingRow[],
  }
}

// The reads used before SQL52. They see at most 500 public athletes, in no defined order,
// so past 500 the true leaders can be missing. Kept only until SQL52 is applied on
// Production; delete this function then.
async function legacyIdentityRanking(client: SupabaseClient, { sport, season, now = new Date() }: Options): Promise<IdentityRanking> {
  const { data: profiles, error: profilesError } = await client.from('athlete_profiles').select('user_id, birth_date').eq('sport', sport).eq('is_public', true).limit(500)
  if (profilesError) throw profilesError
  const profileRows = (profiles ?? []) as { user_id: string; birth_date: string | null }[]
  const ids = profileRows.map(profile => profile.user_id)
  if (!ids.length) return { emerging: [], performance: [] }
  const [{ data: ranks, error: ranksError }, { data: ratings, error: ratingsError }] = await Promise.all([
    client.from('player_ranks').select('*').eq('sport', sport).eq('season', season).in('player_id', ids).limit(500),
    client.from('player_ratings').select('player_id, player_rank_id, goals, assists, clean_sheets, mvps, matches_played').eq('sport', sport).eq('season', season).in('player_id', ids).limit(500),
  ])
  if (ranksError) throw ranksError
  if (ratingsError) throw ratingsError
  const birthById = new Map(profileRows.map(profile => [profile.user_id, profile.birth_date]))
  const statsByRank = new Map(((ratings ?? []) as (Stats & { player_rank_id: string | null })[]).filter(item => item.player_rank_id).map(item => [item.player_rank_id!, item]))
  const rows = ((ranks ?? []) as (Record<string, unknown> & { id: string; player_id: string | null })[]).map(rank => {
    const birth = rank.player_id ? birthById.get(rank.player_id) : null
    const stats = statsByRank.get(rank.id)
    return {
      ...rank,
      under_18: Boolean(birth) && now.getFullYear() - new Date(`${birth}T00:00:00`).getFullYear() < 18,
      goals: stats?.goals ?? 0,
      assists: stats?.assists ?? 0,
      clean_sheets: stats?.clean_sheets ?? 0,
      mvps: stats?.mvps ?? 0,
      matches_played: stats?.matches_played ?? 0,
    } as IdentityRankingRow
  })
  const byId = (a: IdentityRankingRow, b: IdentityRankingRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return {
    emerging: rows.filter(row => row.under_18)
      .sort((a, b) => b.rank_change - a.rank_change || b.pts - a.pts || byId(a, b))
      .slice(0, IDENTITY_RANKING_LIMIT),
    performance: [...rows]
      .sort((a, b) => b.mvps - a.mvps || b.goals - a.goals || b.pts - a.pts || byId(a, b))
      .slice(0, IDENTITY_RANKING_LIMIT),
  }
}
