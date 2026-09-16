import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  nextPreviewRefreshDelay,
  schedulePreviewRefresh,
  type PreviewState,
} from '@/lib/venue-photo-preview'

const ready = (expiresAt: number): PreviewState => ({ status: 'ready', url: 'https://signed', expiresAt })

describe('nextPreviewRefreshDelay', () => {
  it('returns the time left on a ready preview', () => {
    expect(nextPreviewRefreshDelay({ a: ready(10_000) }, 4_000)).toBe(6_000)
  })

  it('uses the soonest expiry when several previews are open', () => {
    const delay = nextPreviewRefreshDelay({ a: ready(20_000), b: ready(9_000), c: ready(15_000) }, 4_000)

    expect(delay).toBe(5_000)
  })

  it('returns 0 for a preview that has already lapsed so it refreshes at once', () => {
    expect(nextPreviewRefreshDelay({ a: ready(1_000) }, 4_000)).toBe(0)
  })

  it('schedules nothing when no preview is ready', () => {
    expect(nextPreviewRefreshDelay({}, 0)).toBeNull()
    expect(nextPreviewRefreshDelay({ a: { status: 'loading' } }, 0)).toBeNull()
  })

  it('never schedules a refresh for a preview that failed', () => {
    // A 403 must not turn into a timer that retries for ever.
    expect(nextPreviewRefreshDelay({ a: { status: 'error', message: 'ไม่มีสิทธิ์' } }, 0)).toBeNull()
  })

  it('ignores a failed preview when a working one is also open', () => {
    const delay = nextPreviewRefreshDelay(
      { bad: { status: 'error', message: 'ไม่มีสิทธิ์' }, good: ready(8_000) },
      3_000,
    )

    expect(delay).toBe(5_000)
  })
})

describe('schedulePreviewRefresh', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
  afterEach(() => { vi.useRealTimers() })

  it('calls back once the signed url reaches its expiry', () => {
    // Regression: a ready preview used to sit there for ever because nothing woke React
    // up at expiresAt, so the page kept an image url that had already died.
    const onDue = vi.fn()
    schedulePreviewRefresh({ a: ready(5_000) }, onDue)

    expect(onDue).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4_999)
    expect(onDue).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onDue).toHaveBeenCalledTimes(1)
  })

  it('fires immediately for a url that already lapsed', () => {
    const onDue = vi.fn()
    schedulePreviewRefresh({ a: ready(-1_000) }, onDue)

    vi.advanceTimersByTime(0)
    expect(onDue).toHaveBeenCalledTimes(1)
  })

  it('cancels the timer when the caller cleans up, so an unmount fires nothing', () => {
    const onDue = vi.fn()
    const cleanup = schedulePreviewRefresh({ a: ready(5_000) }, onDue)

    cleanup()
    vi.advanceTimersByTime(10_000)

    expect(onDue).not.toHaveBeenCalled()
  })

  it('returns a cleanup that is safe to call when nothing was scheduled', () => {
    const onDue = vi.fn()
    const cleanup = schedulePreviewRefresh({ a: { status: 'error', message: 'x' } }, onDue)

    expect(() => cleanup()).not.toThrow()
    vi.advanceTimersByTime(60_000)
    expect(onDue).not.toHaveBeenCalled()
  })

  it('fires only once per schedule, leaving the next one to the caller', () => {
    const onDue = vi.fn()
    schedulePreviewRefresh({ a: ready(1_000) }, onDue)

    vi.advanceTimersByTime(60_000)

    expect(onDue).toHaveBeenCalledTimes(1)
  })
})

describe('VenuePhotoManager refresh wiring', () => {
  it('schedules and cleans up the expiry timer inside an effect', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../app/venue/VenuePhotoManager.tsx', import.meta.url), 'utf8')

    expect(source).toContain('schedulePreviewRefresh(')
    // The scheduler returns its own cleanup; the effect has to return it.
    expect(source).toMatch(/useEffect\(\(\) => schedulePreviewRefresh\(/)
  })

  it('feeds the timer tick back into the fetch effect dependencies', async () => {
    // Regression on the fix itself: firing the timer only helps if the value it bumps
    // is a dependency of the effect that calls loadPreview. Bumping a state value the
    // effect does not depend on re-renders the component and changes nothing.
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../app/venue/VenuePhotoManager.tsx', import.meta.url), 'utf8')

    const fetchEffect = source.match(/useEffect\(\(\) => \{[\s\S]*?shouldFetchPreview[\s\S]*?\}, \[([^\]]*)\]\)/)
    expect(fetchEffect, 'the fetch effect must exist').toBeTruthy()
    expect(fetchEffect![1]).toContain('previewTick')

    // The tick value itself has to be read, not discarded as `const [, setTick]`.
    expect(source).not.toMatch(/const \[\s*,\s*setPreviewTick\]/)
  })
})
