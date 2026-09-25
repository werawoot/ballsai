import { describe, expect, it } from 'vitest'

import { buildVenueRlsChecks } from '../scripts/rls-venue-checks.mjs'

const ids = {
  ownerNotificationId: 'owner-notification',
  requesterNotificationId: 'requester-notification',
  bookingId: 'booking-1',
  reservedSlotId: 'reserved-slot',
  openSlotId: 'open-slot',
}

describe('buildVenueRlsChecks', () => {
  it('uses a known notification as a positive control before asserting it is hidden from other users', () => {
    const checks = buildVenueRlsChecks(ids)

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'venue owner can read own notification',
        audience: 'owner',
        expected: 'visible',
        path: '/notifications?id=eq.owner-notification&select=id,title',
      }),
      expect.objectContaining({
        label: 'requester cannot read owner notification',
        audience: 'requester',
        expected: 'hidden',
      }),
      expect.objectContaining({
        label: 'unrelated user cannot read owner notification',
        audience: 'unrelated',
        expected: 'hidden',
      }),
    ]))
  })

  it('treats anonymous notification and booking reads as permission denials, not RLS-empty results', () => {
    const checks = buildVenueRlsChecks(ids)

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'anonymous user cannot read notifications',
        audience: 'anonymous',
        expected: 'denied',
        path: '/notifications?select=id&limit=1',
      }),
      expect.objectContaining({
        label: 'anonymous user cannot read venue booking requests',
        audience: 'anonymous',
        expected: 'denied',
        path: '/venue_booking_requests?select=id&limit=1',
      }),
    ]))
  })

  it('checks that only the venue owner can see a reserved slot while an unrelated user can still see an open slot', () => {
    const checks = buildVenueRlsChecks(ids)

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'requester cannot read reserved venue slot',
        audience: 'requester',
        expected: 'hidden',
        path: '/venue_slots?id=eq.reserved-slot&select=id,status',
      }),
      expect.objectContaining({
        label: 'venue owner can read reserved venue slot',
        audience: 'owner',
        expected: 'visible',
      }),
      expect.objectContaining({
        label: 'unrelated user can read open venue slot',
        audience: 'unrelated',
        expected: 'visible',
        path: '/venue_slots?id=eq.open-slot&select=id,status',
      }),
      expect.objectContaining({
        label: 'anonymous user can read open venue slot',
        audience: 'anonymous',
        expected: 'visible',
      }),
    ]))
  })
})
