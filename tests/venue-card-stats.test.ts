import { describe, expect, it } from 'vitest'
import { venueCardStats, type VenueCardCourt } from '@/lib/venue-card-stats'

const NOW = new Date('2026-10-01T00:00:00.000Z')
const future = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`
const past = '2026-09-20T10:00:00.000Z'

const court = (name: string, sport: 'football' | 'futsal', slots: VenueCardCourt['venue_slots']): VenueCardCourt =>
  ({ id: name, name, sport, venue_slots: slots })

const slot = (id: string, price: number, startsAt: string, status = 'open') =>
  ({ id, price_baht: price, starts_at: startsAt, status })

describe('venueCardStats', () => {
  it('counts the playable spaces', () => {
    const stats = venueCardStats([court('A', 'football', []), court('B', 'futsal', [])], NOW)

    expect(stats.courtCount).toBe(2)
  })

  it('lists each sport once, in Thai', () => {
    const stats = venueCardStats([
      court('A', 'football', []),
      court('B', 'football', []),
      court('C', 'futsal', []),
    ], NOW)

    expect(stats.sports).toEqual(['ฟุตบอล', 'ฟุตซอล'])
  })

  it('counts only open slots that are still in the future', () => {
    const stats = venueCardStats([court('A', 'football', [
      slot('s1', 500, future(5)),
      slot('s2', 700, past),
      slot('s3', 600, future(7), 'reserved'),
      slot('s4', 800, future(9), 'blocked'),
    ])], NOW)

    expect(stats.openSlotCount).toBe(1)
  })

  it('reports the price range across bookable slots only', () => {
    const stats = venueCardStats([court('A', 'football', [
      slot('s1', 500, future(5)),
      slot('s2', 1200, future(6)),
      slot('s3', 90, past),
      slot('s4', 99999, future(7), 'reserved'),
    ])], NOW)

    expect(stats.minPrice).toBe(500)
    expect(stats.maxPrice).toBe(1200)
  })

  it('collapses a single price into one value rather than a range', () => {
    const stats = venueCardStats([court('A', 'football', [slot('s1', 800, future(5))])], NOW)

    expect(stats.priceLabel).toBe('฿800')
  })

  it('shows a range when prices differ', () => {
    const stats = venueCardStats([court('A', 'football', [
      slot('s1', 800, future(5)),
      slot('s2', 1500, future(6)),
    ])], NOW)

    expect(stats.priceLabel).toBe('฿800–1,500')
  })

  it('says there is nothing bookable rather than showing a fake price', () => {
    const stats = venueCardStats([court('A', 'football', [slot('s1', 800, past)])], NOW)

    expect(stats.openSlotCount).toBe(0)
    expect(stats.minPrice).toBeNull()
    expect(stats.priceLabel).toBeNull()
  })

  it('tolerates a venue with no court rows at all', () => {
    const stats = venueCardStats(null, NOW)

    expect(stats).toEqual({
      courtCount: 0,
      sports: [],
      openSlotCount: 0,
      minPrice: null,
      maxPrice: null,
      priceLabel: null,
    })
  })

  it('tolerates a court whose slot list is null', () => {
    const stats = venueCardStats([court('A', 'football', null)], NOW)

    expect(stats.courtCount).toBe(1)
    expect(stats.openSlotCount).toBe(0)
  })
})
