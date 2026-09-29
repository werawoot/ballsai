import { describe, expect, it } from 'vitest'
import { HALL_PAGE_SIZE, fetchHallPage } from '@/lib/public-hall'

type Row = Record<string, unknown>

// A stand-in for PostgREST: the table is already in the order asked for; every filter,
// order and bound the code sends is recorded.
function fakeSupabase(rows: Row[]) {
  const asked: string[] = []
  let current = rows
  const builder = {
    select: (columns: string) => { asked.push(`select ${columns}`); return builder },
    eq: (column: string, value: unknown) => { asked.push(`${column}=${value}`); current = current.filter(row => !(column in row) || row[column] === value); return builder },
    order: (column: string, options?: { ascending?: boolean }) => { asked.push(`order ${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
    range: async (start: number, end: number) => { asked.push(`range ${start}-${end}`); return { data: current.slice(start, end + 1), error: null } },
  }
  return { client: { from: (table: string) => { asked.push(`from ${table}`); return builder } } as never, asked }
}

const entries = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `e${index + 1}`, season: '2026', athlete_name: `Athlete ${index + 1}` }))

// T49: the Hall of Fame read every entry of the season in one request. PostgREST answers
// at most its max-rows setting, so past that the oldest honours silently disappeared.
describe('Hall of Fame, one page at a time', () => {
  it('reaches every entry of a season through the next pages, each exactly once', async () => {
    const all = entries(HALL_PAGE_SIZE * 2 + 5)
    const seen: string[] = []
    let page = 1
    for (;;) {
      const { client } = fakeSupabase(all)
      const result = await fetchHallPage(client, { season: '2026', page })
      expect(result.entries.length).toBeLessThanOrEqual(HALL_PAGE_SIZE)
      seen.push(...result.entries.map(entry => entry.id as string))
      if (!result.hasNext) break
      page += 1
    }
    expect(page).toBe(3)
    expect(seen).toEqual(all.map(entry => entry.id))
  })

  it('orders newest first with a unique tiebreak, and reads one row past the page', async () => {
    const { client, asked } = fakeSupabase(entries(3))
    await fetchHallPage(client, { season: '2026', page: 2 })
    expect(asked).toContain('from hall_of_fame_entries')
    expect(asked.filter(entry => entry.startsWith('order'))).toEqual(['order awarded_at desc', 'order id asc'])
    expect(asked).toContain(`range ${HALL_PAGE_SIZE}-${2 * HALL_PAGE_SIZE}`)
  })

  it('sends the season and every chosen filter to the database', async () => {
    const { client, asked } = fakeSupabase(entries(1))
    await fetchHallPage(client, { season: '2025', page: 1, category: 'mvp', age: 'U15', province: 'น่าน' })
    expect(asked).toEqual(expect.arrayContaining(['season=2025', 'category=mvp', 'age_group=U15', 'province=น่าน']))
  })

  it('leaves out filters that were not chosen', async () => {
    const { client, asked } = fakeSupabase(entries(1))
    await fetchHallPage(client, { season: '2026', page: 1 })
    expect(asked.some(entry => /^(category|age_group|province)=/.test(entry))).toBe(false)
  })
})
