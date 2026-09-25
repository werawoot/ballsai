// Shared pending state for buttons that fire one async request and then refresh the page.
//
// Every venue flow guarded double submission with `disabled` alone. That is a
// render-time guard: a double click landing before React re-renders, or a keyboard
// repeat, still reaches the handler. It also left the button's label unchanged, so the
// only cue was a spinner icon -- silent for a screen reader. These two helpers keep the
// cue and the guard in one place.

export type PendingButton = {
  disabled: boolean
  'aria-busy': boolean
  label: string
  isPending: boolean
}

export function pendingButton({ pending, key, idle, busy, disabled = false }: {
  /** The key of the action currently in flight, or null when idle. */
  pending: string | null
  key: string
  idle: string
  busy: string
  /** The button's own reason to be unavailable, independent of any pending action. */
  disabled?: boolean
}): PendingButton {
  const isPending = pending === key
  return {
    // Everything locks while one action runs: a second request would race the first and
    // the refresh that follows it.
    disabled: pending !== null || disabled,
    // Only the running button is busy. Marking the others would announce work they are
    // not doing.
    'aria-busy': isPending,
    label: isPending ? busy : idle,
    isPending,
  }
}

// Call at the top of the handler. This is the guard `disabled` cannot provide.
export function shouldStartAction(pending: string | null) {
  return pending === null
}

export const VENUE_PENDING_COPY = {
  booking: { idle: 'ส่งคำขอจอง', busy: 'กำลังส่งคำขอ...' },
  approve: { idle: 'อนุมัติและเผยแพร่', busy: 'กำลังอนุมัติ...' },
  hide: { idle: 'ซ่อนรูป', busy: 'กำลังซ่อน...' },
  upload: { idle: 'เพิ่มรูป', busy: 'กำลังอัปโหลด...' },
  remove: { idle: 'ลบ', busy: 'กำลังลบ...' },
  cover: { idle: 'ตั้งเป็นปก', busy: 'กำลังตั้งปก...' },
  move: { idle: 'เลื่อนรูป', busy: 'กำลังเลื่อน...' },
} as const
