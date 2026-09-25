// Mirror of the contract SQL41 writes into public.notifications.
// SQL41 is the producer; this file is what the app expects to read back. The two are
// separate implementations on purpose and are kept in step by
// tests/venue-booking-notification-migration.test.ts.

export const VENUE_BOOKING_NOTIFICATION_TYPE = 'venue_booking'

// SQL41 formats the snapshot time with `at time zone 'Asia/Bangkok'`.
export const VENUE_BOOKING_TIME_ZONE = 'Asia/Bangkok'

export const VENUE_BOOKING_TRANSITIONS = ['requested', 'confirmed', 'declined', 'cancelled'] as const

export type VenueBookingTransition = typeof VENUE_BOOKING_TRANSITIONS[number]

export const VENUE_BOOKING_SOURCE_PREFIX: Record<VenueBookingTransition, string> = {
  requested: 'venue_booking_requested',
  confirmed: 'venue_booking_confirmed',
  declined: 'venue_booking_declined',
  cancelled: 'venue_booking_cancelled',
}

export const VENUE_BOOKING_HREF = {
  owner: '/venue',
  requester: '/venues/bookings',
} as const

// The owner acts on a request; the requester is told the outcome. A cancellation is the
// requester's own action, so it goes to the owner, who needs to know the slot reopened.
const RECIPIENT: Record<VenueBookingTransition, 'owner' | 'requester'> = {
  requested: 'owner',
  confirmed: 'requester',
  declined: 'requester',
  cancelled: 'owner',
}

export type VenueBookingNotificationInput = {
  transition: VenueBookingTransition
  bookingId: string
  ownerId: string
  requesterId: string
  venueName: string
  courtName: string
  slotStartsAt: string
}

export type VenueBookingNotification = {
  userId: string
  type: typeof VENUE_BOOKING_NOTIFICATION_TYPE
  title: string
  body: string
  href: string
  sourceKey: string
}

const TITLE: Record<VenueBookingTransition, string> = {
  requested: 'มีคำขอจองสนามใหม่',
  confirmed: 'เจ้าของสนามยืนยันการจองแล้ว',
  declined: 'คำขอจองถูกปฏิเสธ',
  cancelled: 'ผู้ขอยกเลิกคำขอจอง',
}

const OUTCOME: Record<VenueBookingTransition, string> = {
  requested: 'เปิดหน้าจัดการสนามเพื่อตอบรับหรือปฏิเสธ',
  confirmed: 'ช่วงเวลานี้เป็นของคุณแล้ว',
  declined: 'ช่วงเวลานี้กลับมาเปิดให้จองแล้ว',
  cancelled: 'ช่วงเวลานี้กลับมาเปิดให้จองแล้ว',
}

// SQL17 caps title at 160 and body at 500 characters, and a venue name can be 120 with
// a court name of 100. Trim the parts that come from user-entered venue data.
const TITLE_LIMIT = 160
const BODY_LIMIT = 500

export function venueBookingSourceKey(transition: VenueBookingTransition, bookingId: string) {
  return `${VENUE_BOOKING_SOURCE_PREFIX[transition]}:${bookingId}`
}

export function buildVenueBookingNotification(input: VenueBookingNotificationInput): VenueBookingNotification {
  const recipient = RECIPIENT[input.transition]
  // Pinned to Asia/Bangkok to match what SQL41 writes. Without this the server's own
  // time zone leaks in: CI and Vercel run in UTC, so a Thai reader would see -7 hours.
  const when = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: VENUE_BOOKING_TIME_ZONE,
  }).format(new Date(input.slotStartsAt))
  // Deliberately carries no requester name, no purpose, no note and no contact number.
  const body = `${input.venueName.slice(0, 120)} · ${input.courtName.slice(0, 100)} · ${when} — ${OUTCOME[input.transition]}`

  return {
    userId: recipient === 'owner' ? input.ownerId : input.requesterId,
    type: VENUE_BOOKING_NOTIFICATION_TYPE,
    title: TITLE[input.transition].slice(0, TITLE_LIMIT),
    body: body.slice(0, BODY_LIMIT),
    href: VENUE_BOOKING_HREF[recipient],
    sourceKey: venueBookingSourceKey(input.transition, input.bookingId),
  }
}
