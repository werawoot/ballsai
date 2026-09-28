import { describe, expect, it } from 'vitest'
import { fetchPublishedVenuesPage, VENUES_PAGE_SIZE } from '@/lib/public-venues'

// A stand-in for the Supabase query builder: it answers `.range(from, to)` from a fixed,
// already-ordered set of rows, the way PostgREST does, and records the filters it was
// asked for. Only the database boundary is faked; the code under test is real.
function fakeSupabase(rows: { id: string }[]) {
  const filters: string[] = []
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push(`${column}=${value}`); return builder },
    gt: (column: string, value: unknown) => { filters.push(`${column}>${value}`); return builder },
    order: () => builder,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
  }
  return { client: { from: () => builder }, filters }
}
const venues = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `v${index + 1}` }))

describe('published venues, one page at a time', () => {
  it('returns one page of venues and says there are more', async () => {
    const { client } = fakeSupabase(venues(45))
    const page = await fetchPublishedVenuesPage(client as never, { page: 1 })
    expect(VENUES_PAGE_SIZE).toBe(20)
    expect(page.venues.map(venue => venue.id)).toEqual(venues(20).map(venue => venue.id))
    expect(page.hasNext).toBe(true)
  })

  it('asks the database only for slots someone could still book', async () => {
    // A venue collects slots every week for years; the card counts only open, future
    // ones, so fetching the rest would grow each page without changing what it shows.
    const { client, filters } = fakeSupabase(venues(3))
    await fetchPublishedVenuesPage(client as never, { page: 1, now: new Date('2026-10-01T00:00:00.000Z') })
    expect(filters).toEqual(expect.arrayContaining([
      'venue_courts.venue_slots.status=open',
      'venue_courts.venue_slots.starts_at>2026-10-01T00:00:00.000Z',
    ]))
  })
})
