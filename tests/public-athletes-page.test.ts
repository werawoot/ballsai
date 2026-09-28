import { describe, expect, it } from 'vitest'
import { ATHLETES_PAGE_SIZE, fetchPublicAthletesPage } from '@/lib/public-athletes'

type Row = Record<string, unknown>

// A stand-in for PostgREST: each table is already in the order the query asks for, and
// every filter, order and bound the code sends is recorded. Only the database is faked.
function fakeSupabase(tables: Record<string, Row[]>) {
  const asked: Record<string, string[]> = {}
  const from = (table: string) => {
    const log = (asked[table] ??= [])
    let rows = tables[table] ?? []
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { log.push(`${column}=${value}`); rows = rows.filter(row => !(column in row) || row[column] === value); return builder },
      ilike: (column: string, value: unknown) => { log.push(`${column}~${value}`); return builder },
      gt: (column: string, value: unknown) => { log.push(`${column}>${value}`); return builder },
      lte: (column: string, value: unknown) => { log.push(`${column}<=${value}`); return builder },
      in: (column: string, values: unknown[]) => { log.push(`${column} in ${values.length}`); rows = rows.filter(row => values.includes(row[column])); return builder },
      order: (column: string, options?: { ascending?: boolean }) => { log.push(`order ${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
      range: async (start: number, end: number) => { log.push(`range ${start}-${end}`); return { data: rows.slice(start, end + 1), error: null } },
      limit: async (count: number) => { log.push(`limit ${count}`); return { data: rows.slice(0, count), error: null } },
    }
    return builder
  }
  return { client: { from }, asked }
}

const athletes = (count: number) => Array.from({ length: count }, (_, index) => ({ user_id: `user-${index + 1}`, display_name: `Athlete ${index + 1}` }))
const base = { sport: 'football', season: '2026', today: new Date('2026-09-28T05:00:00Z') }

describe('/athletes, one page at a time', () => {
  it('reaches every one of 101 athletes through the next pages, each exactly once', async () => {
    // The old page read limit(100): athlete 101 was never shown to anyone.
    const { client } = fakeSupabase({ athlete_profiles: athletes(101) })
    const seen: string[] = []
    let page = 1
    for (;;) {
      const result = await fetchPublicAthletesPage(client as never, { ...base, page })
      expect(result.athletes.length).toBeLessThanOrEqual(ATHLETES_PAGE_SIZE)
      seen.push(...result.athletes.map(athlete => athlete.user_id))
      if (!result.hasNext) break
      page += 1
    }
    expect(ATHLETES_PAGE_SIZE).toBe(24)
    expect(page).toBe(5)
    expect(seen).toEqual(athletes(101).map(athlete => athlete.user_id))
  })

  it('orders by a stable key with a unique tiebreak, public profiles of the sport only', async () => {
    const { client, asked } = fakeSupabase({ athlete_profiles: athletes(3) })
    await fetchPublicAthletesPage(client as never, { ...base, page: 2 })
    expect(asked.athlete_profiles).toEqual(expect.arrayContaining(['is_public=true', 'sport=football', `range ${ATHLETES_PAGE_SIZE}-${2 * ATHLETES_PAGE_SIZE}`]))
    const orders = asked.athlete_profiles.filter(entry => entry.startsWith('order'))
    expect(orders).toEqual(['order created_at desc', 'order user_id asc'])
  })

  // The age group used to be applied after the read, so a page of 24 could show 3 and the
  // rest of the group sat on pages nobody could reach. It must be part of the query.
  it.each([
    ['u12', 'birth_date>2014-09-28'],
    ['u15', 'birth_date>2011-09-28'],
    ['u18', 'birth_date>2008-09-28'],
    ['adult', 'birth_date<=2006-09-28'],
  ])('asks the database for age group %s', async (ageGroup, filter) => {
    const { client, asked } = fakeSupabase({ athlete_profiles: athletes(1) })
    await fetchPublicAthletesPage(client as never, { ...base, page: 1, ageGroup })
    expect(asked.athlete_profiles).toContain(filter)
  })

  it('ignores an unknown age group and sends the other filters to the database', async () => {
    const { client, asked } = fakeSupabase({ athlete_profiles: athletes(1) })
    await fetchPublicAthletesPage(client as never, { ...base, page: 1, ageGroup: 'u99', province: 'เชียงใหม่', position: 'GK', search: 'Som' })
    expect(asked.athlete_profiles.some(entry => entry.startsWith('birth_date'))).toBe(false)
    expect(asked.athlete_profiles).toEqual(expect.arrayContaining(['province=เชียงใหม่', 'position=GK', 'display_name~%Som%']))
  })

  it('reads ranks only for the athletes on the page', async () => {
    const { client, asked } = fakeSupabase({
      athlete_profiles: athletes(30),
      player_ranks: [{ id: 'rank-2', player_id: 'user-2', pts: 1200, ovr: 70, position: 'MF', sport: 'football', season: '2026' }],
    })
    const result = await fetchPublicAthletesPage(client as never, { ...base, page: 1 })
    expect(asked.player_ranks).toEqual(expect.arrayContaining([`player_id in ${ATHLETES_PAGE_SIZE}`, 'sport=football', 'season=2026', `limit ${ATHLETES_PAGE_SIZE}`]))
    expect(result.ranks.map(rank => rank.id)).toEqual(['rank-2'])
  })
})
