import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import { VENUE_PENDING_COPY } from '@/lib/pending-action'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

import VenueOwnerClient, { type OwnerBooking, type OwnerVenue, type OwnerVenuePhoto } from '@/app/venue/VenueOwnerClient'
import VenuePhotoManager from '@/app/venue/VenuePhotoManager'

const THAI = /[ก-ฺเ-๛]/
const render = (locale: Locale, component: ComponentType<never>, props: object) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, {
    locale,
    messages: locale === 'th' ? th : withFallback(en, th),
    timeZone: 'Asia/Bangkok',
  } as never, createElement(component, props as never)))
const readable = (html: string) => [
  ...html.replace(/<[^>]*>/g, '\n').split('\n'),
  ...[...html.matchAll(/(?:placeholder|aria-label|alt|title)="([^"]*)"/g)].map(match => match[1]),
].map(text => text.trim()).filter(Boolean)
// What the owner and the booker typed is shown as entered, in any language.
const DATA = ['สนามบอลลุงหมี', 'สนาม 5A', 'หญ้าเทียม', 'ซอยสุขุมวิท 50', 'ซ้อมทีม U12', 'มาก่อน 10 นาที']
const thaiIn = (html: string) =>
  readable(html).filter(text => THAI.test(text) && !DATA.some(value => text.includes(value)))

const venues: OwnerVenue[] = [{
  id: 'v1', name: 'สนามบอลลุงหมี', province: 'กรุงเทพฯ', address: 'ซอยสุขุมวิท 50', contact_phone: '081', description: '', amenities: [],
  venue_courts: [{
    id: 'c1', name: 'สนาม 5A', sport: 'futsal', surface: 'หญ้าเทียม', capacity: 10,
    venue_slots: [
      { id: 's1', starts_at: '2099-01-01T10:00:00Z', ends_at: '2099-01-01T11:00:00Z', price_baht: 800, status: 'open' },
      { id: 's2', starts_at: '2099-01-02T10:00:00Z', ends_at: '2099-01-02T11:00:00Z', price_baht: 800, status: 'reserved' },
    ],
  }],
}]
const bookings: OwnerBooking[] = (['pending', 'confirmed', 'declined', 'cancelled'] as const).map(status => ({
  id: `b-${status}`, status, purpose: 'ซ้อมทีม U12', note: 'มาก่อน 10 นาที', requested_at: '2098-12-01T00:00:00Z',
  venue_slots: { starts_at: '2099-01-02T10:00:00Z', ends_at: '2099-01-02T11:00:00Z', price_baht: 800, venue_courts: { name: 'สนาม 5A', venue_profiles: { name: 'สนามบอลลุงหมี' } } },
}))
// One photo in each moderation state, the cover among them.
const photos: OwnerVenuePhoto[] = (['pending', 'visible', 'hidden'] as const).map((status, index) => ({
  id: `p${index}`, venue_id: 'v1', object_path: `v1/p${index}.webp`, caption: '', sort_order: index,
  is_cover: status === 'visible', moderation_status: status, created_at: '2026-10-01T00:00:00Z',
}))

describe('venue owner tools in English', () => {
  it('show no Thai UI text: stats, forms, open slots, booking inbox and every status', () => {
    const html = render('en', VenueOwnerClient as ComponentType<never>, { venues, bookings, photos })
    expect(thaiIn(html)).toEqual([])
    for (const word of ['Pending', 'Confirmed', 'Declined', 'Cancelled', 'Futsal', 'Bangkok']) expect(html).toContain(word)
  })

  it('show the create form, which only a first-time owner sees, in English too', () => {
    const html = render('en', VenueOwnerClient as ComponentType<never>, { venues: [], bookings: [], photos: [] })
    expect(thaiIn(html)).toEqual([])
    expect(html).toContain('placeholder=')
  })

  it('format slot and booking times for the reader, not always in Thai', () => {
    const html = render('en', VenueOwnerClient as ComponentType<never>, { venues, bookings, photos })
    expect(html).toContain('2099')
    expect(html).not.toContain('2642') // the Buddhist-era year th-TH would print
  })

  it('word the photo manager, its moderation badges and its loading previews', () => {
    const html = render('en', VenuePhotoManager as ComponentType<never>, { venueId: 'v1', venueName: 'สนามบอลลุงหมี', photos })
    expect(thaiIn(html)).toEqual([])
    const empty = render('en', VenuePhotoManager as ComponentType<never>, { venueId: 'v1', venueName: 'สนามบอลลุงหมี', photos: [] })
    expect(thaiIn(empty)).toEqual([])
  })

  it('still read in Thai for a Thai owner, province as stored', () => {
    const html = render('th', VenueOwnerClient as ComponentType<never>, { venues, bookings, photos })
    expect(html).toContain('กรุงเทพฯ')
    expect(html).toContain('รอตอบรับ')
    expect(html).toContain('รอตรวจสอบ')
    expect(html).toContain('2642')
  })
})

describe('venue owner copy', () => {
  it('keeps the Thai pending labels the shared VENUE_PENDING_COPY uses elsewhere', () => {
    const copy = th.venueOwner.photos.pending
    for (const action of ['upload', 'remove', 'cover', 'move'] as const) {
      expect(copy[action]).toEqual(VENUE_PENDING_COPY[action])
    }
  })

  it('takes the page title and the all-venues link from messages', () => {
    const page = readFileSync(new URL('../app/venue/page.tsx', import.meta.url), 'utf8')
    expect(page).toContain("getTranslations('venueOwner.page')")
    expect(page).not.toMatch(THAI)
  })
})
