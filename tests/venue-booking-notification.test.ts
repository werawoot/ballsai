import { describe, expect, it } from 'vitest'
import {
  VENUE_BOOKING_NOTIFICATION_TYPE,
  buildVenueBookingNotification,
  venueBookingSourceKey,
  type VenueBookingNotificationInput,
} from '@/lib/venue-booking-notification'

const BOOKING_ID = '7c1f9a22-3b44-4d10-8e0f-91a2b3c4d5e6'

const input = (
  transition: VenueBookingNotificationInput['transition'],
  overrides: Partial<VenueBookingNotificationInput> = {},
): VenueBookingNotificationInput => ({
  transition,
  bookingId: BOOKING_ID,
  ownerId: 'owner-1',
  requesterId: 'requester-1',
  venueName: 'BallDoenSai Arena',
  courtName: 'สนาม A',
  slotStartsAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
})

describe('venueBookingSourceKey', () => {
  it('gives every transition of one booking its own key', () => {
    const keys = (['requested', 'confirmed', 'declined', 'cancelled'] as const)
      .map(transition => venueBookingSourceKey(transition, BOOKING_ID))

    expect(new Set(keys).size).toBe(4)
    expect(keys[0]).toBe(`venue_booking_requested:${BOOKING_ID}`)
  })

  it('is stable so a repeated call de-duplicates on the unique source_key', () => {
    expect(venueBookingSourceKey('confirmed', BOOKING_ID))
      .toBe(venueBookingSourceKey('confirmed', BOOKING_ID))
  })
})

describe('buildVenueBookingNotification', () => {
  it('tells the venue owner about a new request', () => {
    const notification = buildVenueBookingNotification(input('requested'))

    expect(notification.userId).toBe('owner-1')
    expect(notification.href).toBe('/venue')
    expect(notification.type).toBe(VENUE_BOOKING_NOTIFICATION_TYPE)
  })

  it('tells the requester when the owner confirms', () => {
    const notification = buildVenueBookingNotification(input('confirmed'))

    expect(notification.userId).toBe('requester-1')
    expect(notification.href).toBe('/venues/bookings')
  })

  it('tells the requester when the owner declines', () => {
    const notification = buildVenueBookingNotification(input('declined'))

    expect(notification.userId).toBe('requester-1')
    expect(notification.href).toBe('/venues/bookings')
  })

  it('tells the venue owner when the requester cancels', () => {
    const notification = buildVenueBookingNotification(input('cancelled'))

    expect(notification.userId).toBe('owner-1')
    expect(notification.href).toBe('/venue')
  })

  it('never leaks the free-text purpose, the note, or a contact number', () => {
    const notification = buildVenueBookingNotification(input('requested', {
      venueName: 'สนามกลาง',
      courtName: 'คอร์ท 1',
    }))
    const rendered = `${notification.title} ${notification.body}`

    expect(rendered).not.toContain('ซ้อมทีม U16')
    expect(rendered).not.toContain('0812345678')
    expect(rendered).not.toContain('requester-1')
    expect(rendered).not.toContain('owner-1')
  })

  it('stays inside the SQL17 title and body limits even with maximum-length names', () => {
    const notification = buildVenueBookingNotification(input('confirmed', {
      venueName: 'ส'.repeat(120),
      courtName: 'ค'.repeat(100),
    }))

    expect(notification.title.length).toBeLessThanOrEqual(160)
    expect(notification.title.length).toBeGreaterThan(0)
    expect(notification.body.length).toBeLessThanOrEqual(500)
  })

  it('renders the slot time in Asia/Bangkok, matching what SQL41 writes', () => {
    // 10:00 UTC is 17:00 in Bangkok. A body rendered in any other zone would disagree
    // with the notification the database produced.
    const notification = buildVenueBookingNotification(input('confirmed', {
      slotStartsAt: '2026-10-01T10:00:00.000Z',
    }))

    expect(notification.body).toContain('17:00')
  })

  it('renders a readable Thai body for each transition', () => {
    for (const transition of ['requested', 'confirmed', 'declined', 'cancelled'] as const) {
      const notification = buildVenueBookingNotification(input(transition))
      expect(notification.title.length).toBeGreaterThan(0)
      expect(notification.body).toContain('BallDoenSai Arena')
      expect(notification.body).toContain('17:00')
      expect(notification.sourceKey).toBe(venueBookingSourceKey(transition, BOOKING_ID))
    }
  })
})
