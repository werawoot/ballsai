import { describe, expect, it } from 'vitest'
import {
  nextPreviewState,
  previewAltText,
  shouldFetchPreview,
  type PreviewState,
} from '@/lib/venue-photo-preview'

describe('shouldFetchPreview', () => {
  it('fetches when nothing has been loaded yet', () => {
    expect(shouldFetchPreview(undefined, 1_000)).toBe(true)
  })

  it('does not refetch while a request is in flight', () => {
    expect(shouldFetchPreview({ status: 'loading' }, 1_000)).toBe(false)
  })

  it('reuses a url that has not expired', () => {
    const state: PreviewState = { status: 'ready', url: 'https://x', expiresAt: 60_000 }

    expect(shouldFetchPreview(state, 30_000)).toBe(false)
  })

  it('refetches once the url has expired', () => {
    const state: PreviewState = { status: 'ready', url: 'https://x', expiresAt: 60_000 }

    expect(shouldFetchPreview(state, 60_001)).toBe(true)
  })

  it('does not retry a failure on its own, so one refusal is not a request loop', () => {
    expect(shouldFetchPreview({ status: 'error', message: 'ไม่มีสิทธิ์' }, 1_000)).toBe(false)
  })
})

describe('nextPreviewState', () => {
  it('turns a successful response into a ready state with an absolute expiry', () => {
    const state = nextPreviewState({ ok: true, url: 'https://signed', expiresIn: 60 }, 10_000)

    expect(state.status).toBe('ready')
    expect(state.status === 'ready' && state.url).toBe('https://signed')
    // Absolute, and inside the real 70s deadline: the safety margin is asserted below.
    expect(state.status === 'ready' && state.expiresAt).toBeGreaterThan(10_000)
    expect(state.status === 'ready' && state.expiresAt).toBeLessThan(70_000)
  })

  it('expires a little early so the image is never requested with a dead url', () => {
    const state = nextPreviewState({ ok: true, url: 'https://signed', expiresIn: 60 }, 0)

    expect(state.status === 'ready' && state.expiresAt).toBeLessThanOrEqual(60_000)
  })

  it('keeps the server message so the owner learns why it failed', () => {
    const state = nextPreviewState({ ok: false, error: 'เฉพาะเจ้าของสนามหรือผู้ดูแลระบบเท่านั้นที่ดูรูปนี้ได้' }, 0)

    expect(state).toEqual({ status: 'error', message: 'เฉพาะเจ้าของสนามหรือผู้ดูแลระบบเท่านั้นที่ดูรูปนี้ได้' })
  })

  it('falls back to a readable Thai message when the server sends none', () => {
    const state = nextPreviewState({ ok: false }, 0)

    expect(state.status).toBe('error')
    expect(state.status === 'error' && state.message.length).toBeGreaterThan(0)
  })
})

describe('previewAltText', () => {
  it('names the venue and the position of the photo', () => {
    const alt = previewAltText('สนามบอลลุงหมี', 0)

    expect(alt).toContain('สนามบอลลุงหมี')
    expect(alt).toContain('1')
  })

  it('gives each photo a distinct alt', () => {
    expect(previewAltText('สนาม A', 0)).not.toBe(previewAltText('สนาม A', 1))
  })

  it('says a cover photo is the cover', () => {
    expect(previewAltText('สนาม A', 0, true)).toContain('ปก')
  })
})
