import { describe, expect, it } from 'vitest'
import { fetchPublicTournamentsPage, TOURNAMENTS_PAGE_SIZE } from '@/lib/public-tournaments'

// Only the database boundary is faked: an ordered table answered through `.range()`.
function fakeSupabase(rows: { id: string }[]) {
  const builder = {
    select: () => builder,
    order: () => builder,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
  }
  return { from: () => builder }
}
const tournaments = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `t${index + 1}` }))

describe('public tournaments, one page at a time', () => {
  it('returns the second page and knows it is the last', async () => {
    const page = await fetchPublicTournamentsPage(fakeSupabase(tournaments(30)) as never, { page: 2 })
    expect(TOURNAMENTS_PAGE_SIZE).toBe(20)
    expect(page.tournaments.map(item => item.id)).toEqual(['t21', 't22', 't23', 't24', 't25', 't26', 't27', 't28', 't29', 't30'])
    expect(page.hasNext).toBe(false)
  })
})
