// Recovery state for the scout shortlist after a write whose response was lost.
//
// `add_scout_shortlist_safely` upserts against a unique (scout_id, athlete_id) and
// `remove_scout_shortlist_safely` is a plain delete, so repeating either cannot create a
// second row. What a lost response does take away is this tab's knowledge of which way
// the row ended up, and that is a fact about ONE athlete, not about the board.
//
// The rules this module holds, and the reason each one exists:
//
//   * A row with an unknown outcome refuses further writes until it has been read back
//     from the server. Guessing would show the scout a state nobody has confirmed.
//   * Every other row stays writable at all times, including while a read-back runs.
//     A dropped connection on one bookmark must not cost the scout the whole desk.
//   * ONLY a successful read-back unlocks a row. A read-back that fails -- offline, or
//     the server answering with an error -- leaves the row exactly as unknown as it was.
//   * "Read it again" is always available on an affected row, however many times it has
//     already failed. The thing that gets you out must never be gated on itself.
//   * Replies are matched to the attempt that asked for them. Two presses can be in
//     flight at once and answer out of order, so an older reply must not overwrite what
//     a newer one already established.
//
// Keeping this out of the component is what makes those rules testable without a DOM.

export type ShortlistRecovery = {
  /** Athlete ids whose last write neither succeeded nor failed as far as this tab knows. */
  unknownRows: string[]
  /** Athlete ids with a read-back in flight. Presentation only -- never gates a control. */
  checking: string[]
}

export const EMPTY_SHORTLIST_RECOVERY: ShortlistRecovery = { unknownRows: [], checking: [] }

/**
 * How many read-backs have been asked for per athlete. It lives beside the state rather
 * than inside it because it orders requests; it is not something the screen draws.
 */
export type AttemptLedger = Record<string, number>

export const EMPTY_ATTEMPT_LEDGER: AttemptLedger = {}

/** Claim the next attempt number for this athlete. The caller keeps the returned ledger. */
export function recordAttempt(ledger: AttemptLedger, athleteId: string): { ledger: AttemptLedger; attempt: number } {
  const attempt = (ledger[athleteId] ?? 0) + 1
  return { ledger: { ...ledger, [athleteId]: attempt }, attempt }
}

/**
 * Whether a reply still speaks for the row. False once a later press has been made: that
 * newer request owns the row's outcome, and acting on the older answer would either
 * unlock a row the newer one is still checking or re-lock one it already cleared.
 */
export function isLatestAttempt(ledger: AttemptLedger, athleteId: string, attempt: number): boolean {
  return (ledger[athleteId] ?? 0) === attempt
}

/** The write for this athlete never produced a response. */
export function markOutcomeUnknown(state: ShortlistRecovery, athleteId: string): ShortlistRecovery {
  if (state.unknownRows.includes(athleteId)) return state
  return { ...state, unknownRows: [...state.unknownRows, athleteId] }
}

/** A read-back has been sent for this athlete. */
export function startCheck(state: ShortlistRecovery, athleteId: string): ShortlistRecovery {
  if (state.checking.includes(athleteId)) return state
  return { ...state, checking: [...state.checking, athleteId] }
}

/** The server answered for this athlete. Its row is now known, so the lock comes off. */
export function resolveCheck(state: ShortlistRecovery, athleteId: string): ShortlistRecovery {
  return {
    unknownRows: state.unknownRows.filter(id => id !== athleteId),
    checking: state.checking.filter(id => id !== athleteId),
  }
}

/**
 * The read-back itself failed. The row stays unknown -- nothing was learnt -- but it
 * stops reporting itself as checking, so the scout can ask again.
 */
export function failCheck(state: ShortlistRecovery, athleteId: string): ShortlistRecovery {
  if (!state.checking.includes(athleteId)) return state
  return { ...state, checking: state.checking.filter(id => id !== athleteId) }
}

/** Whether this athlete's bookmark may be written. Unaffected by any other row's state. */
export function canWriteRow(state: ShortlistRecovery, athleteId: string): boolean {
  return !state.unknownRows.includes(athleteId)
}

/** Whether this athlete's row should offer a read-back. True again after a failed one. */
export function canReloadRow(state: ShortlistRecovery, athleteId: string): boolean {
  return state.unknownRows.includes(athleteId)
}

/** Whether to show this athlete's read-back as running. Label only. */
export function isChecking(state: ShortlistRecovery, athleteId: string): boolean {
  return state.checking.includes(athleteId)
}

/** What a read-back must contain before it is allowed to speak for a row. */
export type ShortlistRow = { athleteId: string; saved: boolean; note: string }

/**
 * Read a `2xx` body, or refuse it.
 *
 * A 2xx status is not on its own an answer. `requestJson` reports a body it could not
 * parse as `{ ok: true, data: null }`, which is what a proxy error page, a truncated
 * response or a redirect to a login screen all look like from here. Treating that as
 * "the row is not saved" would unlock the row AND drop the scout's bookmark from the
 * list on the strength of a response nobody wrote.
 *
 * So the shape is checked rather than assumed, and the athlete id is compared with the
 * one that was asked about: a reply for a different row answers nothing about this one.
 * Anything that does not match leaves the row exactly as unknown as it was.
 */
export function parseShortlistRow(data: unknown, athleteId: string): ShortlistRow | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (row.athleteId !== athleteId) return null
  if (typeof row.saved !== 'boolean') return null
  if (typeof row.note !== 'string') return null
  return { athleteId, saved: row.saved, note: row.note }
}
