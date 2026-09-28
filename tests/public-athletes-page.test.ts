import { describe, expect, it } from 'vitest'
import { ATHLETES_PAGE_SIZE, fetchPublicAthletesPage } from '@/lib/public-athletes'

type Row = Record<string, unknown>

// A stand-in for PostgREST: each table is already in the order the query asks for, and
// every filter, order and bound the code sends is recorded. Only the database is faked.
// Before SQL58 there is no public_athlete_directory view: the fake answers PGRST205.
function fakeSupabase(tables: Record<string, Row[]>, { withoutView = false } = {}) {
  const asked: Record<string, string[]> = {}
  const from = (table: string) => {
    const log = (asked[table] ??= [])
    let rows = tables[table] ?? []
    const missing = withoutView && table === 'public_athlete_directory'
    const answer = (data: Row[]) => missing ? { data: null, error: { code: 'PGRST205', message: 'missing' } } : { data, error: null }
    const builder = {
      select: (columns: string) => { log.push(`select ${columns}`); return builder },
      eq: (column: string, value: unknown) => { log.push(`${column}=${value}`); rows = rows.filter(row => !(column in row) || row[column] === value); return builder },
      ilike: (column: string, value: unknown) => { log.push(`${column}~${value}`); return builder },
      gt: (column: string, value: unknown) => { log.push(`${column}>${value}`); return builder },
      lte: (column: string, value: unknown) => { log.push(`${column}<=${value}`); return builder },
      lt: (column: string, value: unknown) => { log.push(`${column}<${value}`); return builder },
      gte: (column: string, value: unknown) => { log.push(`${column}>=${value}`); return builder },
      in: (column: string, values: unknown[]) => { log.push(`${column} in ${values.length}`); rows = rows.filter(row => values.includes(row[column])); return builder },
      order: (column: string, options?: { ascending?: boolean }) => { log.push(`order ${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
      range: async (start: number, end: number) => { log.push(`range ${start}-${end}`); return answer(rows.slice(start, end + 1)) },
      limit: async (count: number) => { log.push(`limit ${count}`); return answer(rows.slice(0, count)) },
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
    const { client } = fakeSupabase({ public_athlete_directory: athletes(101) })
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
    const { client, asked } = fakeSupabase({ public_athlete_directory: athletes(3) })
    await fetchPublicAthletesPage(client as never, { ...base, page: 2 })
    // The view holds public profiles only (sql/58); the sport is still the caller's filter.
    expect(asked.public_athlete_directory).toEqual(expect.arrayContaining(['sport=football', `range ${ATHLETES_PAGE_SIZE}-${2 * ATHLETES_PAGE_SIZE}`]))
    const orders = asked.public_athlete_directory.filter(entry => entry.startsWith('order'))
    expect(orders).toEqual(['order created_at desc', 'order user_id asc'])
  })

  // The age group used to be applied after the read, so a page of 24 could show 3 and the
  // rest of the group sat on pages nobody could reach. It must be part of the query.
  it.each([
    ['u12', 'age<12'],
    ['u15', 'age<15'],
    ['u18', 'age<18'],
    ['adult', 'age>=20'],
  ])('asks the database for age group %s by age, never by birth date', async (ageGroup, filter) => {
    const { client, asked } = fakeSupabase({ public_athlete_directory: athletes(1) })
    await fetchPublicAthletesPage(client as never, { ...base, page: 1, ageGroup })
    expect(asked.public_athlete_directory).toContain(filter)
    expect(asked.public_athlete_directory.join(' ')).not.toContain('birth_date')
    expect(asked.athlete_profiles).toBeUndefined()
  })

  // T50: a child's birth date is not the public's. The directory shows an age, which the
  // database works out; the date itself is never asked for once SQL58 is applied.
  it('shows each athlete\'s age from the database and no birth date', async () => {
    const { client, asked } = fakeSupabase({ public_athlete_directory: [{ user_id: 'u1', display_name: 'A', age: 11 }] })
    const result = await fetchPublicAthletesPage(client as never, { ...base, page: 1 })
    expect(asked.public_athlete_directory[0]).toMatch(/^select .*\bage\b/)
    expect(result.athletes[0]).toMatchObject({ user_id: 'u1', age: 11 })
    expect(result.athletes[0]).not.toHaveProperty('birth_date')
  })

  it.each([
    ['u12', 'birth_date>2014-09-28'],
    ['u15', 'birth_date>2011-09-28'],
    ['u18', 'birth_date>2008-09-28'],
    ['adult', 'birth_date<=2006-09-28'],
  ])('until SQL58, filters age group %s on the profiles table and still hands out only an age', async (ageGroup, filter) => {
    const { client, asked } = fakeSupabase({
      public_athlete_directory: [],
      // Born 29 Sep 2014: the day before the 12th birthday in Bangkok (28 Sep 2026).
      athlete_profiles: [{ user_id: 'u1', display_name: 'A', birth_date: '2014-09-29' }, { user_id: 'u2', display_name: 'B', birth_date: '2014-09-28' }],
    }, { withoutView: true })
    const result = await fetchPublicAthletesPage(client as never, { ...base, page: 1, ageGroup })
    expect(asked.athlete_profiles).toEqual(expect.arrayContaining(['is_public=true', 'sport=football', filter]))
    expect(result.athletes.map(athlete => athlete.age)).toEqual([11, 12])
    for (const athlete of result.athletes) expect(athlete).not.toHaveProperty('birth_date')
  })

  it('ignores an unknown age group and sends the other filters to the database', async () => {
    const { client, asked } = fakeSupabase({ public_athlete_directory: athletes(1) })
    await fetchPublicAthletesPage(client as never, { ...base, page: 1, ageGroup: 'u99', province: 'เชียงใหม่', position: 'GK', search: 'Som' })
    expect(asked.public_athlete_directory.some(entry => entry.startsWith('age'))).toBe(false)
    expect(asked.public_athlete_directory).toEqual(expect.arrayContaining(['province=เชียงใหม่', 'position=GK', 'display_name~%Som%']))
  })

  it('reads ranks only for the athletes on the page', async () => {
    const { client, asked } = fakeSupabase({
      public_athlete_directory: athletes(30),
      player_ranks: [{ id: 'rank-2', player_id: 'user-2', pts: 1200, ovr: 70, position: 'MF', sport: 'football', season: '2026' }],
    })
    const result = await fetchPublicAthletesPage(client as never, { ...base, page: 1 })
    expect(asked.player_ranks).toEqual(expect.arrayContaining([`player_id in ${ATHLETES_PAGE_SIZE}`, 'sport=football', 'season=2026', `limit ${ATHLETES_PAGE_SIZE}`]))
    expect(result.ranks.map(rank => rank.id)).toEqual(['rank-2'])
  })
})
