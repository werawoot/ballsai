import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CANCEL_CONFIRM_MESSAGE,
  canCancelBooking,
  cancellableBookings,
  cancelResultFeedback,
} from '@/lib/venue-booking-cancel'
import type { VenueBookingStatus } from '@/lib/venue-booking-history'

const booking = (id: string, status: VenueBookingStatus) => ({ id, status })

describe('canCancelBooking', () => {
  it('lets the requester cancel a request that is still pending', () => {
    expect(canCancelBooking('pending')).toBe(true)
  })

  it('never offers cancellation for a request the owner already answered', () => {
    // SQL40's cancel_venue_booking_safely only accepts a pending row, so showing the
    // button for any other status would only produce a 409.
    expect(canCancelBooking('confirmed')).toBe(false)
    expect(canCancelBooking('declined')).toBe(false)
  })

  it('never offers cancellation for a request that is already cancelled', () => {
    expect(canCancelBooking('cancelled')).toBe(false)
  })
})

describe('cancellableBookings', () => {
  it('returns only the pending rows', () => {
    const ids = cancellableBookings([
      booking('b1', 'pending'),
      booking('b2', 'confirmed'),
      booking('b3', 'declined'),
      booking('b4', 'cancelled'),
      booking('b5', 'pending'),
    ]).map(item => item.id)

    expect(ids).toEqual(['b1', 'b5'])
  })

  it('returns nothing when no request is pending', () => {
    expect(cancellableBookings([booking('b2', 'confirmed')])).toEqual([])
  })

  it('tolerates an empty list', () => {
    expect(cancellableBookings([])).toEqual([])
  })
})

describe('CANCEL_CONFIRM_MESSAGE', () => {
  it('asks the requester to confirm in Thai before anything is sent', () => {
    expect(CANCEL_CONFIRM_MESSAGE).toContain('ยกเลิก')
    expect(CANCEL_CONFIRM_MESSAGE.length).toBeGreaterThan(10)
  })
})

describe('cancelResultFeedback', () => {
  it('reports success with an explicit tone, never inferred from wording', () => {
    const feedback = cancelResultFeedback({ ok: true, status: 200 })

    expect(feedback.tone).toBe('success')
    expect(feedback.shouldRefresh).toBe(true)
    expect(feedback.text).toContain('ยกเลิก')
  })

  it('tells the requester to reload when the status already moved on', () => {
    const feedback = cancelResultFeedback({ ok: false, status: 409, error: 'สถานะคำขอนี้เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่' })

    expect(feedback.tone).toBe('error')
    expect(feedback.text).toContain('โหลดหน้าใหม่')
    // A 409 means the list on screen is stale, so it still has to refresh.
    expect(feedback.shouldRefresh).toBe(true)
  })

  it('surfaces a lost session as an error without refreshing', () => {
    const feedback = cancelResultFeedback({ ok: false, status: 401, error: 'กรุณาเข้าสู่ระบบอีกครั้ง' })

    expect(feedback.tone).toBe('error')
    expect(feedback.shouldRefresh).toBe(false)
  })

  it('passes a setup failure through verbatim', () => {
    const feedback = cancelResultFeedback({ ok: false, status: 503, error: 'ระบบจองสนามยังตั้งค่าไม่ครบ กรุณา apply SQL23 ก่อน' })

    expect(feedback.tone).toBe('error')
    expect(feedback.text).toContain('SQL23')
  })

  it('falls back to a readable Thai message when the API sends none', () => {
    const feedback = cancelResultFeedback({ ok: false, status: 400 })

    expect(feedback.tone).toBe('error')
    expect(feedback.text.length).toBeGreaterThan(0)
  })

  it('treats a dropped request as an error rather than silence', () => {
    const feedback = cancelResultFeedback(null)

    expect(feedback.tone).toBe('error')
    expect(feedback.shouldRefresh).toBe(false)
  })
})

// The repo has no DOM test harness (vitest runs in `node`, no @testing-library), so the
// wiring of the client component is guarded by asserting its source. These assertions
// are what stop the button being shown for a non-pending row or sent without a confirm.
describe('BookingHistoryList wiring', () => {
  const source = readFileSync(
    new URL('../app/venues/bookings/BookingHistoryList.tsx', import.meta.url),
    'utf8',
  )

  it('gates the cancel button on the pending-only rule', () => {
    expect(source).toContain('canCancelBooking(booking.status) &&')
  })

  it('asks for confirmation before sending anything', () => {
    expect(source).toContain('window.confirm(CANCEL_CONFIRM_MESSAGE)')
    const confirmAt = source.indexOf('window.confirm(CANCEL_CONFIRM_MESSAGE)')
    const fetchAt = source.indexOf("method: 'DELETE'")
    expect(confirmAt).toBeGreaterThan(-1)
    expect(fetchAt).toBeGreaterThan(confirmAt)
  })

  it('calls the existing DELETE endpoint rather than a new one', () => {
    expect(source).toContain('`/api/venue-bookings/${bookingId}`')
    expect(source).toContain("method: 'DELETE'")
  })

  it('derives the banner tone from cancelResultFeedback, never from the wording', () => {
    expect(source).toContain('cancelResultFeedback(')
    expect(source).toContain("feedback.tone === 'error'")
    expect(source).not.toContain("includes('ไม่สำเร็จ')")
  })

  it('blocks a second click while a cancellation is in flight', () => {
    expect(source).toContain('if (busy) return')
    expect(source).toContain('disabled={busy !== null}')
  })

  it('refreshes the list when the helper says the view is stale', () => {
    expect(source).toContain('if (result.shouldRefresh) router.refresh()')
  })
})
