import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@vercel/analytics', () => ({ track: () => {} }))

import PlayerCardBuilder from '@/app/card/PlayerCardBuilder'

// UX request ค: a card with no name says YOUR NAME and, until now, nothing pointed at the one
// field that fixes it. The card keeps its STARTER wording, its dashes and its empty position
// (rule 8); only the way to the name is added, under the preview.
const player = (name: string) => ({
  name, team: '', province: '', position: '', imageUrl: null, hasProfile: false, isVerified: false, isRanked: false,
  stats: { ovr: null, pac: null, sho: null, pas: null, dri: null, def: null }, provenance: 'self' as const, season: null,
})
const render = (name: string, messages = th as typeof th, locale = 'th') => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale, messages, timeZone: 'Asia/Bangkok' } as never,
  createElement(PlayerCardBuilder as ComponentType<never>, { player: player(name), publicProfilePath: null, userId: 'u1', seasonLabel: '2026' } as never)))

describe('the way to the name on a nameless card', () => {
  it('is a button under the preview and before the editing panel', () => {
    const html = render('')
    const button = html.indexOf('ใส่ชื่อของคุณ')
    expect(button).toBeGreaterThan(html.indexOf('pc-stage'))
    expect(button).toBeLessThan(html.indexOf('pc-panel'))
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>[^<]*(<[^>]*>)*[^<]*ใส่ชื่อของคุณ/)
  })

  it('is not there once the card has a name', () => {
    expect(render('น้องตัวอย่าง')).not.toContain('ใส่ชื่อของคุณ')
  })

  it('leaves the card as it was: YOUR NAME, dashes, no invented position', () => {
    const html = render('')
    expect(html).toContain('YOUR NAME')
    expect(html).toContain('—')
    expect(html).not.toMatch(/<span>(FW|MF|DF|GK)<\/span>/)
  })

  it('is worded in English too', () => {
    expect(render('', en as typeof th, 'en')).toContain('Add your name')
  })
})

describe('the save button once there is something to save', () => {
  const source = readFileSync(new URL('../app/card/PlayerCardBuilder.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../app/card/card.css', import.meta.url), 'utf8')

  it('sits in the sticky bar with the share button, so it is in view without scrolling', () => {
    const cta = source.indexOf('className="pc-cta"')
    expect(cta).toBeGreaterThan(-1)
    const dirtyBar = source.indexOf('pc-savebar is-dirty')
    expect(dirtyBar).toBeGreaterThan(cta)
    expect(dirtyBar).toBeLessThan(source.indexOf('className="pc-primary"'))
    expect(css).toMatch(/\.pc-cta \{[^}]*flex-wrap: wrap/)
  })
})

describe('the info tab where the name is typed', () => {
  const css = readFileSync(new URL('../app/card/card.css', import.meta.url), 'utf8')
  // With "1fr 1fr" the two inputs' intrinsic width pushed the page 68px wider than a 390px
  // phone as soon as this tab opened, which is where the prompt sends people.
  it('has fields that can shrink, so the page never scrolls sideways', () => {
    expect(css).toMatch(/\.pc-fields \{[^}]*minmax\(0, 1fr\)/)
    expect(css).toMatch(/\.pc-field \{[^}]*min-width: 0/)
    expect(css).toMatch(/\.pc-field input \{[^}]*width: 100%/)
  })

  // The sticky save + share bar and the bottom nav cover the foot of the screen; a field that
  // takes focus must be scrolled to above them, not under them.
  it('keeps a focused field clear of the sticky bars', () => {
    expect(css).toMatch(/\.pc-field, \.pc-field input \{[^}]*scroll-margin-bottom: \d+px/)
  })
})
