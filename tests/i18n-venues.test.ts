import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import { PROVINCE_NAMES_EN, provinceName } from '@/lib/thai-provinces'
import { venueCardStats } from '@/lib/venue-card-stats'
import { venuePhotoAlt } from '@/lib/venue-images'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

import VenueCard from '@/components/VenueCard'
import VenuePitchCover from '@/components/VenuePitchCover'
import RankingFilter from '@/app/ranking/RankingFilter'
import AthleteFilters from '@/app/athletes/AthleteFilters'

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
const thaiIn = (html: string, data: string[] = []) =>
  readable(html).filter(text => THAI.test(text) && !data.some(value => text.includes(value)))

describe('Thai province names for English readers', () => {
  it('covers all 77 provinces, each with one distinct English name', () => {
    const names = Object.values(PROVINCE_NAMES_EN)
    expect(Object.keys(PROVINCE_NAMES_EN)).toHaveLength(77)
    expect(new Set(names).size).toBe(77)
    for (const name of names) expect(name).toMatch(/^[A-Z][A-Za-z ]+$/)
  })

  it('uses the English name for an English reader and the stored name for a Thai one', () => {
    expect(provinceName('เชียงใหม่', 'en')).toBe('Chiang Mai')
    expect(provinceName('พระนครศรีอยุธยา', 'en')).toBe('Phra Nakhon Si Ayutthaya')
    expect(provinceName('เชียงใหม่', 'th')).toBe('เชียงใหม่')
  })

  it('understands how Bangkok is usually written', () => {
    for (const bangkok of ['กรุงเทพมหานคร', 'กรุงเทพฯ', 'กรุงเทพ', 'กทม.', 'กทม', ' กรุงเทพฯ ']) {
      expect(provinceName(bangkok, 'en')).toBe('Bangkok')
    }
  })

  it('shows anything it does not know exactly as stored, never a blank', () => {
    expect(provinceName('THAILAND', 'en')).toBe('THAILAND')
    expect(provinceName('ต่างประเทศ', 'en')).toBe('ต่างประเทศ')
    expect(provinceName('', 'en')).toBe('')
  })
})

describe('venue stats return keys, not Thai words', () => {
  it('lists the sports by code, once each, keeping an unknown code as is', () => {
    const court = (sport: string) => ({ id: sport, name: sport, sport, venue_slots: [] })
    expect(venueCardStats([court('football'), court('futsal'), court('football'), court('padel')]).sports)
      .toEqual(['football', 'futsal', 'padel'])
  })

  it('words photo alt text through the caller, keeping a supplied caption', () => {
    const words = (name: string, number: number | null) => number === null ? `${name} venue` : `${name} venue, photo ${number}`
    expect(venuePhotoAlt('Lung Mee', 0, null, words)).toBe('Lung Mee venue')
    expect(venuePhotoAlt('Lung Mee', 2, null, words)).toBe('Lung Mee venue, photo 3')
    expect(venuePhotoAlt('Lung Mee', 0, '  New turf  ', words)).toBe('New turf')
  })
})

const venue = {
  id: 'v1', name: 'สนามบอลลุงหมี', province: 'กรุงเทพฯ', description: 'หญ้าเทียมใหม่',
  venue_courts: [{ id: 'c1', name: 'A', sport: 'futsal', venue_slots: [{ id: 's', price_baht: 500, starts_at: '2099-01-01T10:00:00Z', status: 'open' }] }],
}
const DATA = ['สนามบอลลุงหมี', 'หญ้าเทียมใหม่']

describe('venue screens in English', () => {
  it('shows no Thai UI text on a venue card, and the province in English', () => {
    const html = render('en', VenueCard as ComponentType<never>, { venue })
    expect(thaiIn(html, DATA)).toEqual([])
    expect(html).toContain('Bangkok')
    expect(html).toContain('Futsal')
  })

  it('still reads in Thai for a Thai user, province as stored', () => {
    const html = render('th', VenueCard as ComponentType<never>, { venue })
    expect(html).toContain('กรุงเทพฯ')
    expect(html).toContain('ฟุตซอล')
  })

  it.each([['no-photos'], ['all-broken']] as const)('words the %s placeholder in both languages', reason => {
    expect(thaiIn(render('en', VenuePitchCover as ComponentType<never>, { height: 100, reason }))).toEqual([])
    expect(thaiIn(render('th', VenuePitchCover as ComponentType<never>, { height: 100, reason })).length).toBeGreaterThan(0)
  })

  it('labels province filters in English but keeps the stored name as the value', () => {
    const ranking = render('en', RankingFilter as ComponentType<never>, { provinces: ['เชียงใหม่'], currentProvince: '', currentPosition: '', currentSearch: '' })
    expect(ranking).toContain('Chiang Mai')
    expect(thaiIn(ranking)).toEqual([])
    const athletes = render('en', AthleteFilters as ComponentType<never>, { provinces: ['เชียงใหม่'], currentSearch: '', currentProvince: '', currentPosition: '', currentAge: '' })
    expect(athletes).toContain('<option value="เชียงใหม่">Chiang Mai</option>')
  })
})
