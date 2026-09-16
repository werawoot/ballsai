/**
 * Read-only checks for the venue booking and notification RLS boundaries.
 *
 * The IDs are deliberately supplied at runtime from a disposable test flow.
 * This keeps credentials and production identifiers out of the repository.
 */
export function buildVenueRlsChecks({
  ownerNotificationId,
  requesterNotificationId,
  bookingId,
  reservedSlotId,
  openSlotId,
}) {
  return [
    {
      label: 'venue owner can read own notification',
      audience: 'owner',
      expected: 'visible',
      path: `/notifications?id=eq.${ownerNotificationId}&select=id,title`,
    },
    {
      label: 'requester cannot read owner notification',
      audience: 'requester',
      expected: 'hidden',
      path: `/notifications?id=eq.${ownerNotificationId}&select=id,title`,
    },
    {
      label: 'unrelated user cannot read owner notification',
      audience: 'unrelated',
      expected: 'hidden',
      path: `/notifications?id=eq.${ownerNotificationId}&select=id,title`,
    },
    {
      label: 'requester can read own notification',
      audience: 'requester',
      expected: 'visible',
      path: `/notifications?id=eq.${requesterNotificationId}&select=id,title`,
    },
    {
      label: 'venue owner cannot read requester notification',
      audience: 'owner',
      expected: 'hidden',
      path: `/notifications?id=eq.${requesterNotificationId}&select=id,title`,
    },
    {
      label: 'unrelated user cannot read requester notification',
      audience: 'unrelated',
      expected: 'hidden',
      path: `/notifications?id=eq.${requesterNotificationId}&select=id,title`,
    },
    {
      label: 'anonymous user cannot read notifications',
      audience: 'anonymous',
      expected: 'denied',
      path: '/notifications?select=id&limit=1',
    },
    {
      label: 'requester can read own venue booking',
      audience: 'requester',
      expected: 'visible',
      path: `/venue_booking_requests?id=eq.${bookingId}&select=id,status`,
    },
    {
      label: 'venue owner can read venue booking',
      audience: 'owner',
      expected: 'visible',
      path: `/venue_booking_requests?id=eq.${bookingId}&select=id,status`,
    },
    {
      label: 'unrelated user cannot read venue booking',
      audience: 'unrelated',
      expected: 'hidden',
      path: `/venue_booking_requests?id=eq.${bookingId}&select=id,status`,
    },
    {
      label: 'anonymous user cannot read venue booking requests',
      audience: 'anonymous',
      expected: 'denied',
      path: '/venue_booking_requests?select=id&limit=1',
    },
    {
      label: 'requester cannot read reserved venue slot',
      audience: 'requester',
      expected: 'hidden',
      path: `/venue_slots?id=eq.${reservedSlotId}&select=id,status`,
    },
    {
      label: 'venue owner can read reserved venue slot',
      audience: 'owner',
      expected: 'visible',
      path: `/venue_slots?id=eq.${reservedSlotId}&select=id,status`,
    },
    {
      label: 'unrelated user cannot read reserved venue slot',
      audience: 'unrelated',
      expected: 'hidden',
      path: `/venue_slots?id=eq.${reservedSlotId}&select=id,status`,
    },
    {
      label: 'unrelated user can read open venue slot',
      audience: 'unrelated',
      expected: 'visible',
      path: `/venue_slots?id=eq.${openSlotId}&select=id,status`,
    },
    {
      label: 'anonymous user can read open venue slot',
      audience: 'anonymous',
      expected: 'visible',
      path: `/venue_slots?id=eq.${openSlotId}&select=id,status`,
    },
  ]
}
