import type { VenueBookingStatus } from '@/lib/venue-booking-history'

// SQL40's cancel_venue_booking_safely accepts a pending row only (it raises
// BOOKING_NOT_CANCELLABLE otherwise), so the button exists for exactly that status.
export function canCancelBooking(status: VenueBookingStatus) {
  return status === 'pending'
}

export function cancellableBookings<T extends { status: VenueBookingStatus }>(bookings: T[]) {
  return bookings.filter(booking => canCancelBooking(booking.status))
}

export const CANCEL_CONFIRM_MESSAGE =
  'ยกเลิกคำขอจองนี้ใช่ไหม? ช่วงเวลานี้จะกลับไปเปิดให้คนอื่นจองได้'

export type CancelFeedback = {
  tone: 'success' | 'error'
  text: string
  shouldRefresh: boolean
}

export type CancelResponse = { ok: boolean; status: number; error?: string } | null

// The tone comes from the HTTP result, never from reading the wording of a message.
export function cancelResultFeedback(response: CancelResponse): CancelFeedback {
  if (!response) {
    return { tone: 'error', text: 'ส่งคำขอยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง', shouldRefresh: false }
  }
  if (response.ok) {
    return { tone: 'success', text: 'ยกเลิกคำขอแล้ว ช่วงเวลานี้กลับไปเปิดให้จอง', shouldRefresh: true }
  }
  return {
    tone: 'error',
    text: response.error ?? 'ยกเลิกคำขอไม่สำเร็จ',
    // A 409 means the owner answered while this page was open: the list is stale.
    shouldRefresh: response.status === 409,
  }
}
