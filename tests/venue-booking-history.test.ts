import { describe, expect, it } from 'vitest'
import { toVenueBookingHistoryItem } from '@/lib/venue-booking-history'

describe('venue booking history', () => {
  it('renders an immutable booking snapshot after the live slot becomes private', () => {
    expect(toVenueBookingHistoryItem({
      id: 'booking-1',
      status: 'confirmed',
      purpose: 'ซ้อมทีม',
      note: '',
      requested_at: '2026-09-15T08:00:00.000Z',
      venue_name_snapshot: 'สนามทดสอบระบบ',
      court_name_snapshot: 'สนาม 1',
      slot_starts_at_snapshot: '2026-09-20T10:00:00.000Z',
      slot_ends_at_snapshot: '2026-09-20T11:00:00.000Z',
      price_baht_snapshot: 500,
      venue_slots: null,
    })).toMatchObject({
      venueName: 'สนามทดสอบระบบ',
      courtName: 'สนาม 1',
      startsAt: '2026-09-20T10:00:00.000Z',
      endsAt: '2026-09-20T11:00:00.000Z',
      priceBaht: 500,
    })
  })

  it('falls back to the SQL23 relation before snapshot columns are deployed', () => {
    expect(toVenueBookingHistoryItem({
      id: 'booking-2',
      status: 'pending',
      purpose: 'แข่งกระชับมิตร',
      note: '',
      requested_at: '2026-09-15T08:00:00.000Z',
      venue_slots: {
        starts_at: '2026-09-21T10:00:00.000Z',
        ends_at: '2026-09-21T11:00:00.000Z',
        price_baht: 700,
        venue_courts: { name: 'สนาม A', venue_profiles: { name: 'สนามเดิม' } },
      },
    })).toMatchObject({
      venueName: 'สนามเดิม',
      courtName: 'สนาม A',
      startsAt: '2026-09-21T10:00:00.000Z',
      priceBaht: 700,
    })
  })
})
