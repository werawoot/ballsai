import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// A bare server render has no app-router context; the router is not what these check.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {} }) }))
vi.mock('@vercel/analytics', () => ({ track: () => {} }))

import OnboardingFlow from '@/app/welcome/OnboardingFlow'
import PlayerCardBuilder from '@/app/card/PlayerCardBuilder'
import PublicProfileShare from '@/app/profile/PublicProfileShare'

// Phase 2 of ADR-009: the screens a new user meets right after signing in. Each is
// rendered in English and must not leak a Thai word, except what the user typed.

const THAI = /[ก-ฺเ-๛]/
const render = (locale: Locale, component: ComponentType<never>, props: object) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, {
    locale,
    messages: locale === 'th' ? th : withFallback(en, th),
    timeZone: 'Asia/Bangkok',
  } as never, createElement(component, props as never)))
// The language switch names the other language on purpose ("ไทย" on an English page,
// marked lang="th"), so it is not a leak.
const withoutSwitch = (html: string) => html.replace(/<button[^>]*class="bds-lang-switch"[\s\S]*?<\/button>/g, '')
// Visible text and the attributes a person hears or sees (placeholder, aria-label, alt).
const readable = (raw: string, html = withoutSwitch(raw)) => [
  ...html.replace(/<[^>]*>/g, '\n').split('\n'),
  ...[...html.matchAll(/(?:placeholder|aria-label|alt|title)="([^"]*)"/g)].map(match => match[1]),
].map(text => text.trim()).filter(Boolean)
const thaiIn = (html: string) => readable(html).filter(text => THAI.test(text))

const player = {
  name: 'Somchai',
  position: 'MF',
  team: 'Ayutthaya FC',
  province: 'Ayutthaya',
  imageUrl: null,
  isVerified: false,
  isRanked: false,
  stats: { ovr: 60, pac: 60, sho: 60, pas: 60, dri: 60, def: 60 },
}

const SCREENS: Array<[string, ComponentType<never>, object]> = [
  ['/welcome', OnboardingFlow as ComponentType<never>, { email: 'somchai@example.com', nextPath: '/profile', userId: 'u1' }],
  ['/card', PlayerCardBuilder as ComponentType<never>, { player, publicProfilePath: null, userId: 'u1' }],
  ['/profile share (private)', PublicProfileShare as ComponentType<never>, { profilePath: '/players/1', isPublic: false }],
  ['/profile share (public)', PublicProfileShare as ComponentType<never>, { profilePath: '/players/1', isPublic: true }],
]

describe('the first screens after sign-in, in English', () => {
  it.each(SCREENS)('%s shows no Thai text', (_name, component, props) => {
    expect(thaiIn(render('en', component, props))).toEqual([])
  })

  it.each(SCREENS)('%s still reads in Thai for a Thai user', (_name, component, props) => {
    expect(thaiIn(render('th', component, props)).length).toBeGreaterThan(0)
  })

  it('offers Thai from the English welcome screen, in Thai, marked as Thai', () => {
    const html = render('en', OnboardingFlow as ComponentType<never>, SCREENS[0][2])
    expect(html).toMatch(/<button[^>]*class="bds-lang-switch"[^>]*lang="th"[^>]*>ไทย<\/button>/)
  })

  it('keeps what the person typed exactly as typed', () => {
    const html = render('en', PlayerCardBuilder as ComponentType<never>, { player: { ...player, name: 'สมชาย', team: 'อยุธยา เอฟซี' }, publicProfilePath: null, userId: 'u1' })
    expect(html).toContain('สมชาย')
    expect(thaiIn(html).every(text => /สมชาย|อยุธยา เอฟซี/.test(text))).toBe(true)
  })

  it('says a Starter card is a Starter card, in both languages (AGENTS.md rule 8)', () => {
    for (const locale of ['th', 'en'] as const) {
      expect(render(locale, PlayerCardBuilder as ComponentType<never>, { player, publicProfilePath: null, userId: 'u1' })).toContain('STARTER CARD')
    }
  })
})
