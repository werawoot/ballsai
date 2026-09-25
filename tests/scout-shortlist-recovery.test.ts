import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '@/lib/pending-action'
import {
  EMPTY_ATTEMPT_LEDGER,
  EMPTY_SHORTLIST_RECOVERY,
  canReloadRow,
  canWriteRow,
  failCheck,
  isChecking,
  isLatestAttempt,
  markOutcomeUnknown,
  parseShortlistRow,
  recordAttempt,
  resolveCheck,
  startCheck,
} from '@/lib/scout-shortlist-recovery'

// These drive the real state transitions, not the source text.
//
// The failures they exist for, in the order they were found:
//
//   1. A single page-wide `refreshing` flag, cleared only when new props arrived. A
//      refresh that resolved to identical props left it raised and every button on the
//      board -- including the one offering the way out -- disabled for good.
//   2. New props clearing every unresolved row, so a row that went unknown while the
//      re-read was in flight was unlocked by data that predated it.
//   3. A page refresh standing in for a read of the actual row. Now each affected row
//      asks the server about itself, and only a successful answer unlocks it.

const ALICE = 'athlete-alice'
const BOB = 'athlete-bob'
const CARLA = 'athlete-carla'

afterEach(() => { vi.unstubAllGlobals() })

describe('a write whose response was lost', () => {
  it('locks only the athlete it happened to', () => {
    const state = markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE)

    expect(canWriteRow(state, ALICE)).toBe(false)
    expect(canWriteRow(state, BOB)).toBe(true)
    expect(canWriteRow(state, CARLA)).toBe(true)
  })

  it('offers the read-back on that athlete and on no other', () => {
    const state = markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE)

    expect(canReloadRow(state, ALICE)).toBe(true)
    expect(canReloadRow(state, BOB)).toBe(false)
  })

  it('accumulates rows instead of replacing them', () => {
    const state = markOutcomeUnknown(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), BOB)

    expect(state.unknownRows).toEqual([ALICE, BOB])
    expect(canWriteRow(state, CARLA)).toBe(true)
  })

  it('does not churn state when the same athlete is recorded twice', () => {
    const once = markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE)

    expect(markOutcomeUnknown(once, ALICE)).toBe(once)
  })
})

describe('while a read-back is running', () => {
  const running = startCheck(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), ALICE)

  it('leaves every other athlete writable', () => {
    expect(canWriteRow(running, BOB)).toBe(true)
    expect(canWriteRow(running, CARLA)).toBe(true)
  })

  it('keeps the affected athlete locked, because nothing has confirmed it yet', () => {
    expect(canWriteRow(running, ALICE)).toBe(false)
  })

  it('still offers the read-back, so a second press is always possible', () => {
    expect(canReloadRow(running, ALICE)).toBe(true)
  })

  it('shows the running state as a label on that row alone', () => {
    expect(isChecking(running, ALICE)).toBe(true)
    expect(isChecking(running, BOB)).toBe(false)
  })
})

describe('only a successful read-back unlocks a row', () => {
  const asked = startCheck(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), ALICE)

  it('releases the row when the server answers', () => {
    const answered = resolveCheck(asked, ALICE)

    expect(canWriteRow(answered, ALICE)).toBe(true)
    expect(isChecking(answered, ALICE)).toBe(false)
    expect(canReloadRow(answered, ALICE)).toBe(false)
  })

  it('holds the row when the read-back itself fails, and lets it be asked again', () => {
    const failed = failCheck(asked, ALICE)

    expect(canWriteRow(failed, ALICE)).toBe(false)
    expect(isChecking(failed, ALICE)).toBe(false)
    expect(canReloadRow(failed, ALICE)).toBe(true)
  })

  it('never unlocks through repeated failed attempts alone', () => {
    let state = asked
    for (let attempt = 0; attempt < 10; attempt += 1) state = startCheck(failCheck(state, ALICE), ALICE)

    expect(canWriteRow(state, ALICE)).toBe(false)
    expect(state.unknownRows).toEqual([ALICE])
  })

  it('leaves other rows untouched either way', () => {
    const both = startCheck(markOutcomeUnknown(asked, BOB), BOB)

    expect(canWriteRow(failCheck(both, ALICE), BOB)).toBe(false)
    expect(canWriteRow(resolveCheck(both, ALICE), BOB)).toBe(false)
    expect(canWriteRow(resolveCheck(both, ALICE), CARLA)).toBe(true)
  })
})

describe('replies that come back out of order', () => {
  it('ignores the first reply once a second press has superseded it', () => {
    let ledger = EMPTY_ATTEMPT_LEDGER

    const first = recordAttempt(ledger, ALICE)
    ledger = first.ledger
    const second = recordAttempt(ledger, ALICE)
    ledger = second.ledger

    expect(first.attempt).toBe(1)
    expect(second.attempt).toBe(2)
    expect(isLatestAttempt(ledger, ALICE, first.attempt)).toBe(false)
    expect(isLatestAttempt(ledger, ALICE, second.attempt)).toBe(true)
  })

  it('does not let a slow first reply undo what the second already settled', () => {
    // Press once, press again, then the SECOND answers first and unlocks the row, and
    // the first -- which failed -- arrives afterwards. Acting on it would re-lock a row
    // the server has already spoken for.
    let ledger = EMPTY_ATTEMPT_LEDGER
    let state = markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE)

    const first = recordAttempt(ledger, ALICE); ledger = first.ledger
    state = startCheck(state, ALICE)
    const second = recordAttempt(ledger, ALICE); ledger = second.ledger

    // Second reply lands: success.
    expect(isLatestAttempt(ledger, ALICE, second.attempt)).toBe(true)
    state = resolveCheck(state, ALICE)
    expect(canWriteRow(state, ALICE)).toBe(true)

    // First reply lands late and failed. It is not the latest, so it is dropped.
    expect(isLatestAttempt(ledger, ALICE, first.attempt)).toBe(false)
    const ifItHadBeenApplied = failCheck(state, ALICE)
    expect(canWriteRow(ifItHadBeenApplied, ALICE)).toBe(true) // and it was not applied at all
    expect(canWriteRow(state, ALICE)).toBe(true)
  })

  it('does not let a slow first success unlock a row the second is still checking', () => {
    // The dangerous direction: an old "saved: true" answering for state that has since
    // been written over again.
    let ledger = EMPTY_ATTEMPT_LEDGER
    let state = markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE)

    const first = recordAttempt(ledger, ALICE); ledger = first.ledger
    const second = recordAttempt(ledger, ALICE); ledger = second.ledger
    state = startCheck(state, ALICE)

    expect(isLatestAttempt(ledger, ALICE, first.attempt)).toBe(false)
    // Dropped, so the row is still held and still shown as checking by the second.
    expect(canWriteRow(state, ALICE)).toBe(false)
    expect(isChecking(state, ALICE)).toBe(true)
  })

  it('keeps each athlete\'s attempts independent', () => {
    let ledger = EMPTY_ATTEMPT_LEDGER
    const aliceFirst = recordAttempt(ledger, ALICE); ledger = aliceFirst.ledger
    const bobFirst = recordAttempt(ledger, BOB); ledger = bobFirst.ledger
    const aliceSecond = recordAttempt(ledger, ALICE); ledger = aliceSecond.ledger

    // Bob's single attempt is still current even though Alice moved on.
    expect(isLatestAttempt(ledger, BOB, bobFirst.attempt)).toBe(true)
    expect(isLatestAttempt(ledger, ALICE, aliceFirst.attempt)).toBe(false)
    expect(isLatestAttempt(ledger, ALICE, aliceSecond.attempt)).toBe(true)
  })

  it('treats a reply for an athlete never asked about as stale', () => {
    expect(isLatestAttempt(EMPTY_ATTEMPT_LEDGER, CARLA, 1)).toBe(false)
  })
})

describe('what the read-back request itself reports', () => {
  const readBack = () => requestJson<{ athleteId: string; saved: boolean; note: string }>(
    `/api/scout-shortlist?athleteId=${ALICE}`,
  )

  it('reports a dead connection as a network outcome, so the row stays locked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await readBack()

    expect(result).toEqual({ ok: false, kind: 'network' })
    // The row keeps its lock: nothing was learnt.
    const state = failCheck(startCheck(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), ALICE), ALICE)
    expect(canWriteRow(state, ALICE)).toBe(false)
    expect(canReloadRow(state, ALICE)).toBe(true)
  })

  it('keeps the server\'s own words on an HTTP error, and still holds the row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'อ่านสถานะ Shortlist ไม่สำเร็จ' }),
    }))

    const result = await readBack()

    expect(result).toEqual({ ok: false, kind: 'http', status: 400, error: 'อ่านสถานะ Shortlist ไม่สำเร็จ' })
    const state = failCheck(startCheck(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), ALICE), ALICE)
    expect(canWriteRow(state, ALICE)).toBe(false)
  })

  it('surfaces a 401 as an HTTP outcome rather than a lost connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'กรุณาเข้าสู่ระบบก่อน' }),
    }))

    expect(await readBack()).toEqual({ ok: false, kind: 'http', status: 401, error: 'กรุณาเข้าสู่ระบบก่อน' })
  })

  it('carries the row back on success so the tab can replace what it believed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ athleteId: ALICE, saved: true, note: 'quick feet' }),
    }))

    const result = await readBack()

    expect(result).toEqual({ ok: true, data: { athleteId: ALICE, saved: true, note: 'quick feet' } })
  })

  it('asks with a GET and no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ saved: false, note: '' }) })
    vi.stubGlobal('fetch', fetchMock)

    await readBack()

    const [, init] = fetchMock.mock.calls[0]
    // requestJson passes init straight through; the read-back sends none at all, so it
    // cannot accidentally become a write.
    expect(init).toBeUndefined()
  })
})

describe('a 2xx that does not actually answer', () => {
  // `requestJson` reports a body it could not parse as `{ ok: true, data: null }`. A
  // proxy error page, a truncated response and a redirect to a login screen all arrive
  // looking like that. Reading it as "saved: false" would unlock the row AND delete the
  // scout's bookmark from the list on the strength of a response nobody wrote.

  it('refuses an empty body', () => {
    expect(parseShortlistRow(null, ALICE)).toBeNull()
    expect(parseShortlistRow(undefined, ALICE)).toBeNull()
  })

  it('refuses a body that is not an object', () => {
    expect(parseShortlistRow('<!doctype html>', ALICE)).toBeNull()
    expect(parseShortlistRow(42, ALICE)).toBeNull()
    expect(parseShortlistRow([], ALICE)).toBeNull()
  })

  it('refuses a body missing the fields it must have', () => {
    expect(parseShortlistRow({}, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE, saved: true }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE, note: 'x' }, ALICE)).toBeNull()
  })

  it('refuses fields of the wrong type, including a truthy string for saved', () => {
    expect(parseShortlistRow({ athleteId: ALICE, saved: 'true', note: '' }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE, saved: 1, note: '' }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE, saved: null, note: '' }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE, saved: true, note: null }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: ALICE, saved: true, note: 7 }, ALICE)).toBeNull()
  })

  it('refuses an answer about a different athlete', () => {
    // Two rows can be checked at once; an answer for Bob says nothing about Alice.
    expect(parseShortlistRow({ athleteId: BOB, saved: true, note: 'quick feet' }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: null, saved: true, note: '' }, ALICE)).toBeNull()
    expect(parseShortlistRow({ athleteId: '', saved: false, note: '' }, ALICE)).toBeNull()
  })

  it('accepts a well-formed answer either way round', () => {
    expect(parseShortlistRow({ athleteId: ALICE, saved: true, note: 'quick feet' }, ALICE))
      .toEqual({ athleteId: ALICE, saved: true, note: 'quick feet' })
    expect(parseShortlistRow({ athleteId: ALICE, saved: false, note: '' }, ALICE))
      .toEqual({ athleteId: ALICE, saved: false, note: '' })
  })

  it('ignores anything else the server sends along', () => {
    expect(parseShortlistRow({ athleteId: ALICE, saved: true, note: 'x', extra: 'ignored' }, ALICE))
      .toEqual({ athleteId: ALICE, saved: true, note: 'x' })
  })

  it('leaves the row locked and askable when the body is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }))

    const result = await requestJson(`/api/scout-shortlist?athleteId=${ALICE}`)
    // The request "succeeded" as far as the transport is concerned...
    expect(result).toEqual({ ok: true, data: null })
    // ...but it answers nothing, so the row is treated exactly like a failed read.
    expect(parseShortlistRow(result.ok ? result.data : null, ALICE)).toBeNull()

    const state = failCheck(startCheck(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), ALICE), ALICE)
    expect(canWriteRow(state, ALICE)).toBe(false)
    expect(canReloadRow(state, ALICE)).toBe(true)
    expect(isChecking(state, ALICE)).toBe(false)
  })

  it('does not drop the bookmark when a 2xx answers for the wrong athlete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ athleteId: BOB, saved: false, note: '' }) }))

    const result = await requestJson(`/api/scout-shortlist?athleteId=${ALICE}`)

    expect(result.ok).toBe(true)
    // `saved: false` for Bob must not be read as "Alice is not on the shortlist".
    expect(parseShortlistRow(result.ok ? result.data : null, ALICE)).toBeNull()
  })
})

describe('the full sequence a scout actually lives through', () => {
  it('loses one bookmark on a dead connection, retries the read, and recovers', () => {
    let ledger = EMPTY_ATTEMPT_LEDGER
    let state = EMPTY_SHORTLIST_RECOVERY

    // Bookmarks Bob fine, then the connection dies while writing Alice.
    expect(canWriteRow(state, BOB)).toBe(true)
    state = markOutcomeUnknown(state, ALICE)

    // Presses "โหลดสถานะใหม่"; the read-back cannot reach the server either.
    const first = recordAttempt(ledger, ALICE); ledger = first.ledger
    state = startCheck(state, ALICE)
    expect(isLatestAttempt(ledger, ALICE, first.attempt)).toBe(true)
    state = failCheck(state, ALICE)

    // Carla is still bookmarkable, Alice is still held, the read-back is still offered.
    expect(canWriteRow(state, CARLA)).toBe(true)
    expect(canWriteRow(state, ALICE)).toBe(false)
    expect(canReloadRow(state, ALICE)).toBe(true)
    expect(isChecking(state, ALICE)).toBe(false)

    // Presses again; this time the server answers for that row.
    const second = recordAttempt(ledger, ALICE); ledger = second.ledger
    state = startCheck(state, ALICE)
    expect(isLatestAttempt(ledger, ALICE, second.attempt)).toBe(true)
    state = resolveCheck(state, ALICE)

    expect(state).toEqual(EMPTY_SHORTLIST_RECOVERY)
    expect(canWriteRow(state, ALICE)).toBe(true)
  })

  it('holds a row that went unknown while another row was being checked', () => {
    // The race from the previous round, restated against the read-back: Alice is being
    // checked when Bob's write loses its response. Alice's answer speaks only for Alice.
    let state = startCheck(markOutcomeUnknown(EMPTY_SHORTLIST_RECOVERY, ALICE), ALICE)
    state = markOutcomeUnknown(state, BOB)

    state = resolveCheck(state, ALICE)

    expect(canWriteRow(state, ALICE)).toBe(true)
    expect(canWriteRow(state, BOB)).toBe(false)
    expect(canReloadRow(state, BOB)).toBe(true)
  })
})
