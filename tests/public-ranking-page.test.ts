import { describe, expect, it } from 'vitest'
import { RANKING_PAGE_SIZE, fetchMyRankingPosition, fetchRankPosition, fetchRankingPage } from '@/lib/public-ranking-page'

// T46: /ranking showed the top 50 and nothing else, so an athlete ranked 51st or lower
// could never find themselves. It now pages through every ranked athlete, 50 at a time,
// in one fixed order (Power desc, then id), and tells a signed-in athlete where they are.

type Row = Record<string, unknown>

// A stand-in for PostgREST that applies filters, orders, ranges and counts like the
// database does, and records every call.
function fakeClient(rows: Row[]) {
  const calls: { filters: string[]; orders: string[]; range?: [number, number]; count?: boolean }[] = []
  const from = () => {
    const call: (typeof calls)[number] = { filters: [], orders: [] }
    calls.push(call)
    let data = [...rows]
    const sorters: ((a: Row, b: Row) => number)[] = []
    const builder = {
      select: (_columns: string, options?: { count?: string; head?: boolean }) => { if (options?.head) call.count = true; return builder },
      eq: (c: string, v: unknown) => { call.filters.push(`${c}=${v}`); data = data.filter(r => r[c] === v); return builder },
      gt: (c: string, v: number) => { call.filters.push(`${c}>${v}`); data = data.filter(r => (r[c] as number) > v); return builder },
      lt: (c: string, v: string) => { call.filters.push(`${c}<${v}`); data = data.filter(r => String(r[c]) < v); return builder },
      ilike: (c: string, v: string) => { call.filters.push(`${c}~${v}`); const needle = v.replace(/%/g, '').toLowerCase(); data = data.filter(r => String(r[c]).toLowerCase().includes(needle)); return builder },
      order: (c: string, o?: { ascending?: boolean }) => { call.orders.push(`${c} ${o?.ascending === false ? 'desc' : 'asc'}`); const dir = o?.ascending === false ? -1 : 1; sorters.push((a, b) => (a[c] as never) < (b[c] as never) ? -dir : (a[c] as never) > (b[c] as never) ? dir : 0); return builder },
      range: (a: number, b: number) => { call.range = [a, b]; return builder },
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        const sorted = [...data].sort((a, b) => { for (const s of sorters) { const r = s(a, b); if (r) return r } return 0 })
        const sliced = call.range ? sorted.slice(call.range[0], call.range[1] + 1) : sorted
        return Promise.resolve(call.count ? { count: data.length, data: null, error: null } : { data: sliced, error: null }).then(resolve)
      },
    }
    return builder
  }
  return { client: { from } as never, calls }
}

// 130 athletes; every fifth one ties on Power with its neighbour, so order needs the id.
const athletes: Row[] = Array.from({ length: 130 }, (_, i) => ({
  id: `r${String(i).padStart(3, '0')}`, player_id: `u${i}`, player_name: `Player ${i}`,
  sport: 'football', season: '2026', province: i % 2 ? 'Bangkok' : 'Chiang Mai', position: 'MF',
  pts: 2000 - Math.floor(i / 2) * 5,
}))
const base = { sport: 'football', season: '2026' }

describe('ranking pages', () => {
  it('reads one page of 50 in Power order with an id tiebreak, and knows if more follow', async () => {
    const { client, calls } = fakeClient(athletes)
    const first = await fetchRankingPage(client, { ...base, page: 1 })
    expect(RANKING_PAGE_SIZE).toBe(50)
    expect(first.rows).toHaveLength(50)
    expect(first).toMatchObject({ firstRank: 1, hasNext: true })
    expect(calls[0].orders).toEqual(['pts desc', 'id asc'])
    expect(calls[0].range).toEqual([0, 50])
    const third = await fetchRankingPage(client, { ...base, page: 3 })
    expect(third).toMatchObject({ firstRank: 101, hasNext: false })
    expect(third.rows).toHaveLength(30)
  })

  it('shows every athlete exactly once across the pages', async () => {
    const { client } = fakeClient(athletes)
    const pages = await Promise.all([1, 2, 3].map(page => fetchRankingPage(client, { ...base, page })))
    const ids = pages.flatMap(page => page.rows.map(row => row.id))
    expect(new Set(ids).size).toBe(130)
  })

  it('filters in the database before paging', async () => {
    const { client, calls } = fakeClient(athletes)
    const page = await fetchRankingPage(client, { ...base, page: 2, province: 'Bangkok' })
    expect(calls[0].filters).toContain('province=Bangkok')
    expect(page.rows.every(row => row.province === 'Bangkok')).toBe(true)
    expect(page).toMatchObject({ firstRank: 51, hasNext: false })
    expect(page.rows).toHaveLength(15)
  })
})

describe('my position', () => {
  it('counts who is ahead, ties broken by id, and gives the page to open', async () => {
    const { client } = fakeClient(athletes)
    // u87 is r087; r086 has the same Power and a smaller id, so it is one place ahead.
    const mine = await fetchMyRankingPosition(client, { ...base, userId: 'u87' })
    expect(mine).toEqual({ rankId: 'r087', position: 88, page: 2 })
    expect((await fetchMyRankingPosition(client, { ...base, userId: 'u0' }))?.position).toBe(1)
    expect(await fetchMyRankingPosition(client, { ...base, userId: 'u129' })).toEqual({ rankId: 'r129', position: 130, page: 3 })
  })

  it('agrees with the position the pages show', async () => {
    const { client } = fakeClient(athletes)
    const mine = await fetchMyRankingPosition(client, { ...base, userId: 'u87' })
    const page = await fetchRankingPage(client, { ...base, page: mine!.page })
    const index = page.rows.findIndex(row => row.id === mine!.rankId)
    expect(page.firstRank + index).toBe(mine!.position)
  })

  it('is empty for someone with no rank row this season', async () => {
    const { client } = fakeClient(athletes)
    expect(await fetchMyRankingPosition(client, { ...base, userId: 'nobody' })).toBeNull()
  })
})

describe('the position of any rank row (a public profile)', () => {
  it('is the same number the table and "my position" give', async () => {
    const { client } = fakeClient(athletes)
    expect(await fetchRankPosition(client, { ...base, id: 'r087', pts: 2000 - 43 * 5 })).toEqual({ rankId: 'r087', position: 88, page: 2 })
    expect((await fetchRankPosition(client, { ...base, id: 'r000', pts: 2000 }))?.position).toBe(1)
  })
})
