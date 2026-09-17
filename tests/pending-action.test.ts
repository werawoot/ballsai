import { describe, expect, it } from 'vitest'
import { VENUE_PENDING_COPY, pendingButton, shouldStartAction } from '@/lib/pending-action'

const idle = { pending: null, key: 'save', idle: 'บันทึก', busy: 'กำลังบันทึก...' }

describe('pendingButton', () => {
  it('is enabled and not busy when nothing is running', () => {
    expect(pendingButton(idle)).toEqual({
      disabled: false,
      'aria-busy': false,
      label: 'บันทึก',
      isPending: false,
    })
  })

  it('swaps the label and marks the button busy while its own action runs', () => {
    const state = pendingButton({ ...idle, pending: 'save' })

    expect(state.label).toBe('กำลังบันทึก...')
    expect(state['aria-busy']).toBe(true)
    expect(state.isPending).toBe(true)
  })

  it('disables the pending button, so the same action cannot be clicked twice', () => {
    expect(pendingButton({ ...idle, pending: 'save' }).disabled).toBe(true)
  })

  it('disables other buttons too, but does not claim they are busy', () => {
    // A second action while one is in flight would race the first and the page refresh
    // that follows it, so every button locks -- but only the running one is aria-busy.
    const other = pendingButton({ ...idle, pending: 'delete' })

    expect(other.disabled).toBe(true)
    expect(other['aria-busy']).toBe(false)
    expect(other.label).toBe('บันทึก')
    expect(other.isPending).toBe(false)
  })

  it('returns to a usable state once the action finishes, whether it worked or failed', () => {
    // Both the success and the failure path clear the pending key.
    expect(pendingButton({ ...idle, pending: null }).disabled).toBe(false)
    expect(pendingButton({ ...idle, pending: null })['aria-busy']).toBe(false)
    expect(pendingButton({ ...idle, pending: null }).label).toBe('บันทึก')
  })

  it('keeps a button disabled for its own reason even when nothing is pending', () => {
    const state = pendingButton({ ...idle, disabled: true })

    expect(state.disabled).toBe(true)
    expect(state['aria-busy']).toBe(false)
  })

  it('never reports a pending label for a button that is only disabled', () => {
    expect(pendingButton({ ...idle, disabled: true }).label).toBe('บันทึก')
  })
})

describe('shouldStartAction', () => {
  it('allows an action when nothing is in flight', () => {
    expect(shouldStartAction(null)).toBe(true)
  })

  it('refuses a second action while one is running', () => {
    // disabled alone is a render-time guard. A double click that lands before React
    // re-renders, or a keyboard repeat, still reaches the handler.
    expect(shouldStartAction('save')).toBe(false)
    expect(shouldStartAction('anything-else')).toBe(false)
  })
})

describe('VENUE_PENDING_COPY', () => {
  it('gives every venue action a concise Thai idle and pending label', () => {
    for (const [name, copy] of Object.entries(VENUE_PENDING_COPY)) {
      expect(copy.idle.length, `${name} idle`).toBeGreaterThan(0)
      expect(copy.busy.length, `${name} busy`).toBeGreaterThan(0)
      expect(copy.busy, `${name} must read as in progress`).toMatch(/^กำลัง/)
      expect(copy.busy, `${name} must trail off`).toMatch(/\.\.\.$/)
      expect(copy.busy).not.toBe(copy.idle)
      expect(copy.busy.length, `${name} must stay short`).toBeLessThanOrEqual(20)
    }
  })

  it('covers the venue flows that are live', () => {
    expect(Object.keys(VENUE_PENDING_COPY).sort()).toEqual(
      ['approve', 'booking', 'cover', 'hide', 'move', 'remove', 'upload'],
    )
  })

  it('uses the wording the flows are described by', () => {
    expect(VENUE_PENDING_COPY.booking.busy).toBe('กำลังส่งคำขอ...')
    expect(VENUE_PENDING_COPY.approve.busy).toBe('กำลังอนุมัติ...')
    expect(VENUE_PENDING_COPY.hide.busy).toBe('กำลังซ่อน...')
    expect(VENUE_PENDING_COPY.upload.busy).toBe('กำลังอัปโหลด...')
    expect(VENUE_PENDING_COPY.remove.busy).toBe('กำลังลบ...')
  })
})
