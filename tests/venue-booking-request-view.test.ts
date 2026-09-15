import { describe, expect, it } from 'vitest'
import {
  bookingRequestView,
  resolveSelectedSlotId,
} from '@/lib/venue-booking-request'

const slot = (id: string) => ({ id })

describe('resolveSelectedSlotId', () => {
  it('keeps the current choice while that slot is still offered', () => {
    expect(resolveSelectedSlotId('s2', [slot('s1'), slot('s2')])).toBe('s2')
  })

  it('moves to the first available slot once the chosen one is reserved away', () => {
    // router.refresh() drops the reserved slot from props; the old id must not survive.
    expect(resolveSelectedSlotId('s2', [slot('s1'), slot('s3')])).toBe('s1')
  })

  it('selects nothing when no slot is left', () => {
    expect(resolveSelectedSlotId('s2', [])).toBe('')
  })

  it('picks the first slot when nothing was chosen yet', () => {
    expect(resolveSelectedSlotId('', [slot('s1')])).toBe('s1')
  })
})

describe('bookingRequestView', () => {
  it('shows the form while slots are offered and nothing has been sent', () => {
    const view = bookingRequestView({ submitted: false, selected: 's1', slots: [slot('s1')] })

    expect(view.mode).toBe('form')
    expect(view.selected).toBe('s1')
    expect(view.canSubmit).toBe(true)
  })

  it('keeps the confirmation visible after the last slot is taken', () => {
    // Regression: the empty-slot branch used to run first and erase the success message.
    const view = bookingRequestView({ submitted: true, selected: 's1', slots: [] })

    expect(view.mode).toBe('success')
    expect(view.canSubmit).toBe(false)
  })

  it('keeps the confirmation visible when other slots remain', () => {
    const view = bookingRequestView({ submitted: true, selected: 's1', slots: [slot('s2')] })

    expect(view.mode).toBe('success')
    expect(view.canSubmit).toBe(false)
  })

  it('never reports a stale slot as submittable after a successful request', () => {
    // Regression: `selected` held a slot that is now reserved, so a second click
    // would have re-sent a request for a slot nobody can book any more.
    const view = bookingRequestView({ submitted: true, selected: 's1', slots: [slot('s2')] })

    expect(view.selected).not.toBe('s1')
  })

  it('reports the empty state only when nothing was sent and nothing is offered', () => {
    const view = bookingRequestView({ submitted: false, selected: '', slots: [] })

    expect(view.mode).toBe('empty')
    expect(view.canSubmit).toBe(false)
  })

  it('lets the user start a new request from the confirmation', () => {
    const view = bookingRequestView({ submitted: false, selected: 's1', slots: [slot('s2')] })

    expect(view.mode).toBe('form')
    expect(view.selected).toBe('s2')
    expect(view.canSubmit).toBe(true)
  })
})
