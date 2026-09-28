import { describe, expect, it, vi } from 'vitest'
import { fetchIdentityRanking, IDENTITY_RANKING_LIMIT } from '@/lib/public-identity-ranking'

type Row = Record<string, unknown>
type Table = Row[] | { error: { code: string; message: string } }

// A stand-in for PostgREST: each table answers eq/in filters, order and limit the way the
// database would, and records what it was asked. Only the database boundary is faked.
function fakeSupabase(tables: Record<string, Table>) {
  const asked: { table: string; filters: string[]; orders: string[]; limit: number }[] = []
  const from = (table: string) => {
    const query = { table, filters: [] as string[], orders: [] as string[], limit: Infinity }
    const eqs: [string, unknown][] = []
    const ins: [string, unknown[]][] = []
    const sorts: [string, boolean][] = []
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { eqs.push([column, value]); query.filters.push(`${column}=${value}`); return builder },
      in: (column: string, values: unknown[]) => { ins.push([column, values]); query.filters.push(`${column} in (${values.length})`); return builder },
      order: (column: string, options?: { ascending?: boolean }) => { sorts.push([column, options?.ascending ?? true]); query.orders.push(`${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
      limit: async (count: number) => {
        query.limit = count
        asked.push(query)
        const source = tables[table]
        if (!source) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
        if (!Array.isArray(source)) return { data: null, error: source.error }
        const rows = source
          .filter(row => eqs.every(([column, value]) => row[column] === value))
          .filter(row => ins.every(([column, values]) => values.includes(row[column])))
          .sort((a, b) => {
            for (const [column, ascending] of sorts) {
              const left = a[column] as number | string
              const right = b[column] as number | string
              if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1)
            }
            return 0
          })
        return { data: rows.slice(0, count), error: null }
      },
    }
    return builder
  }
  return { client: { from }, asked }
}

// 600 public athletes. The strongest ones were created last, so they sit after row 500
// in any unordered read of athlete_profiles: exactly the athletes the old code dropped.
const athletes = Array.from({ length: 600 }, (_, index) => ({
  id: `rank-${String(index + 1).padStart(3, '0')}`,
  player_id: `user-${index + 1}`,
  player_name: `Athlete ${index + 1}`,
  sport: 'football',
  season: '2026',
  pts: 1000 + index,
  rank_change: index % 7,
  under_18: index % 2 === 0,
  goals: index % 13,
  assists: 0,
  clean_sheets: 0,
  mvps: Math.floor(index / 10),
  matches_played: 5,
}))

describe('identity ranking (ดาวรุ่ง and MVP tabs on /ranking)', () => {
  it('lets the database pick the true top athletes, however many public athletes exist', async () => {
    const { client } = fakeSupabase({ public_athlete_rankings: athletes })
    const result = await fetchIdentityRanking(client as never, { sport: 'football', season: '2026' })

    const byMvp = [...athletes].sort((a, b) => b.mvps - a.mvps || b.goals - a.goals || b.pts - a.pts || (a.id < b.id ? -1 : 1))
    expect(result.performance.map(row => row.id)).toEqual(byMvp.slice(0, IDENTITY_RANKING_LIMIT).map(row => row.id))
    // The 50 MVP leaders are athletes 551–600, all past the 500 the old code read.
    expect(result.performance.every(row => Number(row.id.slice(5)) > 500)).toBe(true)

    const minors = athletes.filter(row => row.under_18).sort((a, b) => b.rank_change - a.rank_change || b.pts - a.pts || (a.id < b.id ? -1 : 1))
    expect(result.emerging.map(row => row.id)).toEqual(minors.slice(0, IDENTITY_RANKING_LIMIT).map(row => row.id))
    expect(result.emerging.every(row => row.under_18)).toBe(true)
  })

  it('asks for one bounded, fully ordered page per tab from the public view only', async () => {
    const { client, asked } = fakeSupabase({ public_athlete_rankings: athletes })
    await fetchIdentityRanking(client as never, { sport: 'football', season: '2026' })

    expect(IDENTITY_RANKING_LIMIT).toBe(50)
    expect(asked.map(query => query.table)).toEqual(['public_athlete_rankings', 'public_athlete_rankings'])
    for (const query of asked) {
      expect(query.filters).toEqual(expect.arrayContaining(['sport=football', 'season=2026']))
      expect(query.limit).toBe(IDENTITY_RANKING_LIMIT)
      // A unique tiebreak last, so equal scores never reorder between requests.
      expect(query.orders.at(-1)).toBe('id asc')
    }
    expect(asked.some(query => query.filters.includes('under_18=true'))).toBe(true)
  })

  it('falls back to the old reads, and says so, until SQL52 creates the view', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = fakeSupabase({
      athlete_profiles: [
        { user_id: 'user-1', birth_date: '2012-05-01', sport: 'football', is_public: true },
        { user_id: 'user-2', birth_date: '1990-05-01', sport: 'football', is_public: true },
      ],
      player_ranks: [
        { id: 'rank-1', player_id: 'user-1', sport: 'football', season: '2026', pts: 1100, rank_change: 2 },
        { id: 'rank-2', player_id: 'user-2', sport: 'football', season: '2026', pts: 1200, rank_change: 1 },
      ],
      player_ratings: [
        { player_id: 'user-2', player_rank_id: 'rank-2', sport: 'football', season: '2026', goals: 4, assists: 1, clean_sheets: 0, mvps: 2, matches_played: 3 },
      ],
    })
    const result = await fetchIdentityRanking(client as never, { sport: 'football', season: '2026', now: new Date('2026-09-28T00:00:00Z') })

    expect(result.emerging.map(row => row.id)).toEqual(['rank-1'])
    expect(result.performance.map(row => [row.id, row.mvps])).toEqual([['rank-2', 2], ['rank-1', 0]])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('public_identity_ranking_view_missing'))
    warn.mockRestore()
  })

  it('does not hide other database errors behind the fallback', async () => {
    const { client } = fakeSupabase({ public_athlete_rankings: { error: { code: '42501', message: 'permission denied' } } })
    await expect(fetchIdentityRanking(client as never, { sport: 'football', season: '2026' })).rejects.toMatchObject({ code: '42501' })
  })
})
