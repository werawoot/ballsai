import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// API routes answer with a stable `code` the page words in the reader's language, and
// keep `error` in Thai, word for word as before, for clients not yet translated
// (BookingRequestClient, VenueOperations, the mobile app).

const boundary = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: boundary.getUser }, rpc: boundary.rpc }),
}))

import { apiError, type ApiErrorCode } from '@/lib/api-error'
import { venuePhotoRpcError } from '@/lib/venue-photo-errors'
import { useApiErrorText } from '@/lib/use-api-error-text'
import { POST as createVenue } from '@/app/api/venues/route'
import { POST as createCourt } from '@/app/api/venues/[venueId]/courts/route'
import { POST as createSlot } from '@/app/api/venue-slots/route'
import { DELETE as closeSlot } from '@/app/api/venue-slots/[slotId]/route'
import { PATCH as respond } from '@/app/api/venue-bookings/[bookingId]/route'

const ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const THAI = /[ก-ฺเ-๛]/
const json = (body: unknown) => new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const expectCode = async (response: Response, status: number, code: ApiErrorCode) => {
  expect(response.status).toBe(status)
  expect(await response.json()).toMatchObject({ code, error: th.apiErrors[code] })
}

beforeEach(() => {
  boundary.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'owner-1' } } })
  boundary.rpc.mockReset()
})

describe('apiError', () => {
  it('sends the code and the Thai sentence from messages/th.json', async () => {
    await expectCode(apiError('signInFirst', 401), 401, 'signInFirst')
  })

  it('keeps extra fields such as the migration to apply', async () => {
    expect(await apiError('slotCloseMigrationMissing', 503, { migration: 'sql/38-close-venue-slot-v1.sql' }).json())
      .toMatchObject({ code: 'slotCloseMigrationMissing', migration: 'sql/38-close-venue-slot-v1.sql' })
  })

  it('has an English sentence for every code, and no placeholders to fill', () => {
    for (const [code, thai] of Object.entries(th.apiErrors)) {
      const english = (en.apiErrors as Record<string, string>)[code]
      expect(english, code).toBeTruthy()
      expect(THAI.test(english), code).toBe(false)
      expect(thai + english, code).not.toMatch(/\{/)
    }
  })
})

describe('venue owner routes answer with a code', () => {
  it('asks a signed-out owner to sign in', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })
    await expectCode(await createVenue(json({})), 401, 'signInFirst')
  })

  it('names a venue form with missing fields', async () => {
    await expectCode(await createVenue(json({ name: 'A' })), 400, 'venueFieldsRequired')
  })

  it('names a court without a name, and a failed court', async () => {
    await expectCode(await createCourt(json({}), { params: Promise.resolve({ venueId: ID }) }), 400, 'courtNameRequired')
    boundary.rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await expectCode(await createCourt(json({ name: 'A' }), { params: Promise.resolve({ venueId: ID }) }), 400, 'courtCreateFailed')
  })

  it('names an invalid slot', async () => {
    await expectCode(await createSlot(json({ courtId: ID, startsAt: 'x', endsAt: 'y', priceBaht: 1 })), 400, 'slotInputInvalid')
  })

  it('maps each close-slot token to its own code', async () => {
    const cases: [string, number, ApiErrorCode][] = [
      ['SLOT_HAS_ACTIVE_BOOKING', 409, 'slotHasActiveBooking'],
      ['SLOT_NOT_OPEN', 409, 'slotNotOpen'],
      ['SLOT_NOT_FOUND', 404, 'slotNotFound'],
      ['VENUE_OWNER_REQUIRED', 403, 'slotOwnerRequired'],
    ]
    for (const [token, status, code] of cases) {
      boundary.rpc.mockResolvedValue({ error: { message: token } })
      await expectCode(await closeSlot(new Request('http://localhost/x'), { params: Promise.resolve({ slotId: ID }) }), status, code)
    }
    await expectCode(await closeSlot(new Request('http://localhost/x'), { params: Promise.resolve({ slotId: 'bad' }) }), 400, 'slotIdInvalid')
  })

  it('keeps the migration hint when SQL38 is missing', async () => {
    boundary.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: '' } })
    const response = await closeSlot(new Request('http://localhost/x'), { params: Promise.resolve({ slotId: ID }) })
    expect(await response.json()).toMatchObject({ code: 'slotCloseMigrationMissing', migration: 'sql/38-close-venue-slot-v1.sql' })
  })

  it('names a booking response from someone who is not the owner', async () => {
    boundary.rpc.mockResolvedValue({ error: { message: 'VENUE_OWNER_REQUIRED' } })
    const request = new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) })
    await expectCode(await respond(request, { params: Promise.resolve({ bookingId: ID }) }), 403, 'bookingOwnerRequired')
  })

  it('maps venue photo tokens to codes', async () => {
    await expectCode(venuePhotoRpcError(undefined, 'VENUE_PHOTO_LIMIT_REACHED'), 409, 'photoLimitReached')
    await expectCode(venuePhotoRpcError(undefined, 'AUTH_REQUIRED'), 401, 'signInAgain')
    await expectCode(venuePhotoRpcError(undefined, 'something else'), 400, 'photoFailed')
    await expectCode(venuePhotoRpcError('42883', ''), 503, 'photoMigrationMissing')
  })
})

describe('the owner pages word the code', () => {
  const Probe = ({ body }: { body: { code?: string; error?: string } | null }) => {
    const errorText = useApiErrorText()
    return createElement('p', null, errorText(body, 'fallback'))
  }
  const render = (locale: Locale, body: { code?: string; error?: string } | null) =>
    renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, {
      locale, messages: locale === 'th' ? th : withFallback(en, th), timeZone: 'Asia/Bangkok',
    } as never, createElement(Probe, { body }))).replace(/&#x27;/g, "'")

  it('in English for an English reader', () => {
    expect(render('en', { code: 'slotHasActiveBooking', error: th.apiErrors.slotHasActiveBooking })).toBe(`<p>${en.apiErrors.slotHasActiveBooking}</p>`)
  })

  it('in Thai for a Thai reader', () => {
    expect(render('th', { code: 'slotHasActiveBooking' })).toBe(`<p>${th.apiErrors.slotHasActiveBooking}</p>`)
  })

  it('falls back to the sentence sent, then to the page fallback, for an unknown code', () => {
    expect(render('en', { code: 'fromTheFuture', error: 'sent text' })).toBe('<p>sent text</p>')
    expect(render('en', null)).toBe('<p>fallback</p>')
  })

  it('is what both owner components use to show a failed request', () => {
    for (const path of ['app/venue/VenueOwnerClient.tsx', 'app/venue/VenuePhotoManager.tsx']) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
      expect(source, path).toContain('useApiErrorText()')
      expect(source, path).not.toContain('data?.error ??')
    }
  })
})
