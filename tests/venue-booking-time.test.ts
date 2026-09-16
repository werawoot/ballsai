import { describe, expect, it } from 'vitest'
import {
  formatVenueBookingDateTime,
  formatVenueBookingTime,
} from '@/lib/venue-booking-time'

describe('venue booking time', () => {
  it('formats a UTC slot in Thailand time for the booking form', () => {
    expect(formatVenueBookingDateTime('2026-09-22T10:00:00.000Z')).toContain('17:00')
  })

  it('formats the slot end time in Thailand time', () => {
    expect(formatVenueBookingTime('2026-09-22T11:00:00.000Z')).toBe('18:00')
  })
})
