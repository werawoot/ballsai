import { describe, expect, it, vi } from 'vitest'

// Before sql/94 the page falls back to the /athletes directory read (lib/public-athletes).
const directory = vi.hoisted(() => ({ calls: [] as unknown[], answer: { athletes: [] as unknown[], ranks: [] as unknown[], hasNext: false } }))
vi.mock('@/lib/public-athletes', () => ({ fetchPublicAthletesPage: async (_client: unknown, options: unknown) => { directory.calls.push(options); return directory.answer } }))

import { SCOUT_MAX_PAGE, SCOUT_PAGE_SIZE, fetchScoutPage, parseScoutFilters } from '@/lib/scout'

// T52: /scout reads one page at a time from public_scout_athletes (sql/94), which sorts by
// Power Rating and filters in the database. Only the database boundary is faked.
function fakeClient(answer: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: Array<[string, Record<string, unknown>]> = []
  return { calls, client: { rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return answer } } }
}
const row = (index: number, rank: string | null = `rank-${index}`) => ({ user_id: `user-${index}`, display_name: `A${index}`, position: 'FW', province: 'ขอนแก่น', current_team: null, verification_level: 'self', rank_id: rank, power: rank ? 1500 : null })

describe('the /scout filters in the address', () => {
  it('keeps only values the page offers', () => {
    expect(parseScoutFilters({ page: '3', q: '  สมชาย ', province: 'ขอนแก่น', position: 'GK', power: '1300' }))
      .toEqual({ page: 3, search: 'สมชาย', province: 'ขอนแก่น', position: 'GK', minPower: 1300 })
    expect(parseScoutFilters({ page: '-2', q: '', province: 'Atlantis', position: 'XX', power: '999' }))
      .toEqual({ page: 1, search: '', province: null, position: null, minPower: null })
  })

  it('sends a page number too large for the database back to page 1', () => {
    expect(parseScoutFilters({ page: String(SCOUT_MAX_PAGE) }).page).toBe(SCOUT_MAX_PAGE)
    expect(parseScoutFilters({ page: '90000000' }).page).toBe(1)
  })

  it('cuts a very long search to 60 characters', () => {
    expect(parseScoutFilters({ q: 'ก'.repeat(200) }).search).toHaveLength(60)
  })
})

describe('one page of /scout', () => {
  it('asks the database for page 2 of the filtered list, one row more to know if there is a page 3', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchScoutPage(client as never, { page: 2, search: 'som', province: 'ขอนแก่น', position: 'FW', minPower: 1300 }, { sport: 'football', season: '2026' })
    expect(calls).toEqual([['public_scout_athletes', {
      p_sport: 'football', p_season: '2026', p_search: 'som', p_province: 'ขอนแก่น', p_position: 'FW', p_min_power: 1300,
      p_limit: SCOUT_PAGE_SIZE + 1, p_offset: SCOUT_PAGE_SIZE,
    }]])
  })

  it('shows a page and says whether another follows; a rated athlete links to the rank, a STARTER to the profile', async () => {
    const rows = [...Array.from({ length: SCOUT_PAGE_SIZE }, (_, index) => row(index + 1)), row(99, null)]
    const { client } = fakeClient({ data: rows, error: null })
    const result = await fetchScoutPage(client as never, { page: 1, search: '', province: null, position: null, minPower: null }, { sport: 'football', season: '2026' })
    expect(result.athletes).toHaveLength(SCOUT_PAGE_SIZE)
    expect(result.hasNext).toBe(true)
    expect(result.athletes[0]).toMatchObject({ user_id: 'user-1', power: 1500, player_path: '/players/rank-1' })
    const starter = await fetchScoutPage(fakeClient({ data: [row(5, null)], error: null }).client as never, { page: 1, search: '', province: null, position: null, minPower: null }, { sport: 'football', season: '2026' })
    expect(starter).toMatchObject({ hasNext: false, byRating: true })
    expect(starter.athletes[0]).toMatchObject({ power: null, player_path: '/players/user-5' })
  })

  it('before sql/94, pages the /athletes directory with the same filters, and says it cannot sort by rating', async () => {
    directory.calls = []
    directory.answer = {
      athletes: [{ user_id: 'u1', display_name: 'A', position: 'GK', province: 'ขอนแก่น', current_team: null, verification_level: 'self' }, { user_id: 'u2', display_name: 'B', verification_level: 'self' }],
      ranks: [{ id: 'rank-1', player_id: 'u1', pts: 1400, ovr: 60, position: 'GK' }],
      hasNext: true,
    }
    const missing = await fetchScoutPage(fakeClient({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }).client as never, { page: 2, search: 'som', province: 'ขอนแก่น', position: 'GK', minPower: 1300 }, { sport: 'football', season: '2026' })
    expect(directory.calls).toEqual([{ page: 2, sport: 'football', season: '2026', search: 'som', province: 'ขอนแก่น', position: 'GK' }])
    expect(missing.byRating).toBe(false)
    expect(missing.hasNext).toBe(true)
    expect(missing.athletes).toEqual([
      { user_id: 'u1', display_name: 'A', position: 'GK', province: 'ขอนแก่น', current_team: null, verification_level: 'self', power: 1400, player_path: '/players/rank-1' },
      { user_id: 'u2', display_name: 'B', position: null, province: null, current_team: null, verification_level: 'self', power: null, player_path: '/players/u2' },
    ])
  })

  it('passes other database errors on', async () => {
    await expect(fetchScoutPage(fakeClient({ data: null, error: { code: '22023', message: 'SCOUT_PAGE_INVALID' } }).client as never, { page: 1, search: '', province: null, position: null, minPower: null }, { sport: 'football', season: '2026' }))
      .rejects.toMatchObject({ code: '22023' })
  })
})
