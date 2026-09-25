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

/** A match confirmation with a lost response stays locked until the page is reloaded. */
export function shouldStartMatchResultAction(pending: string | null, outcomeUnknown: boolean) {
  return !outcomeUnknown && shouldStartAction(pending)
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

// --- Network request outcomes ------------------------------------------------------
//
// Every UI handler in this app used to `await fetch(...)` with no try/catch. A rejected
// fetch (offline, DNS failure, connection dropped mid-flight, request aborted) threw
// past the `setLoading(false)` at the end of the handler, so the button stayed disabled
// with its busy label until the page was reloaded. The form was not merely slow, it was
// dead.
//
// These helpers make the three outcomes explicit and, deliberately, never throw and
// never retry on their own. A silent auto-retry on a mutating request is exactly how
// one tap becomes two writes.

export type RequestOutcome<T> =
  /** The server answered 2xx. `data` is the parsed body, or null when it was not JSON. */
  | { ok: true; data: T | null }
  /** The request never produced a response. The server may or may not have acted. */
  | { ok: false; kind: 'network' }
  /** The server answered, and it answered with an error we can report verbatim. */
  | { ok: false; kind: 'http'; status: number; error: string | null }

/** Shown when the request itself failed. Distinct from any message the server sends. */
export const NETWORK_ERROR_TEXT = 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'

/**
 * Shown when a request that CHANGES data fails at the network layer. The outcome is
 * genuinely unknown: the request may have reached the server and been applied, with only
 * the response lost. Telling the user to "try again" here invites a duplicate, so the
 * copy asks them to check the current state first.
 */
export const NETWORK_OUTCOME_UNKNOWN_TEXT =
  'การเชื่อมต่อหลุดระหว่างบันทึก ยังไม่ทราบว่าระบบบันทึกสำเร็จหรือไม่ กรุณาโหลดหน้าใหม่เพื่อตรวจสถานะล่าสุดก่อนลองอีกครั้ง'

/**
 * `fetch` that reports instead of throwing.
 *
 * The caller decides what to say and whether to offer a retry; this only separates "no
 * response at all" from "the server said no". JSON parsing failure on a 2xx is reported
 * as success with `data: null`, because the status line is the contract for routes that
 * return an empty body.
 */
export async function requestJson<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<RequestOutcome<T>> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch {
    // Offline, aborted, DNS, TLS, connection reset. No response exists to inspect.
    return { ok: false, kind: 'network' }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    return { ok: false, kind: 'http', status: response.status, error: body?.error ?? null }
  }

  return { ok: true, data: (await response.json().catch(() => null)) as T | null }
}

/**
 * The message for a failed outcome. `mutating` picks the wording that does not invite a
 * blind retry; pass it for anything that writes.
 *
 * NOTE ON DUPLICATES: neither this nor `shouldStartAction` can prevent a duplicate write.
 * They stop a second *click* in one tab. They cannot stop a request that reached the
 * server and lost its response, a retry from another tab, or a transport-level retry.
 * Only server-side idempotency (a unique constraint or an idempotency key) can do that.
 */
export function requestErrorText(
  outcome: Extract<RequestOutcome<unknown>, { ok: false }>,
  { fallback, mutating = false }: { fallback: string; mutating?: boolean },
) {
  if (outcome.kind === 'network') {
    return mutating ? NETWORK_OUTCOME_UNKNOWN_TEXT : NETWORK_ERROR_TEXT
  }
  return outcome.error ?? fallback
}
