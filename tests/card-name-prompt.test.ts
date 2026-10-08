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

// UX report 8, mockup 3: a card with no name shows one thing to do. The card says "ใส่ชื่อของคุณ"
// where YOUR NAME used to be, the one red button is the same words, and the tabs and the share
// button wait until there is a name to share. The card keeps its starter wording, its dashes and
// its empty position (rule 8); only the way to the name is added.
const player = (name: string) => ({
  name, team: '', province: '', position: '', imageUrl: null, hasProfile: false, isVerified: false, isRanked: false,
  stats: { ovr: null, pac: null, sho: null, pas: null, dri: null, def: null }, provenance: 'self' as const, season: null,
})
const render = (name: string, messages = th as typeof th, locale = 'th') => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale, messages, timeZone: 'Asia/Bangkok' } as never,
  createElement(PlayerCardBuilder as ComponentType<never>, { player: player(name), publicProfilePath: null, userId: 'u1', seasonLabel: '2026' } as never)))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('a nameless card', () => {
  it('says what the page is and how to start, at the top, on a phone too', () => {
    const html = render('')
    expect(text(html)).toContain('การ์ดนักกีฬาของคุณ')
    expect(text(html)).toContain('ใส่ชื่อ แล้วแชร์ให้เพื่อนดูได้')
    expect(html.indexOf('pc-intro')).toBeLessThan(html.indexOf('pc-stage'))
    expect(readFileSync(new URL('../app/card/card.css', import.meta.url), 'utf8')).not.toMatch(/\.pc-intro \{[^}]*display: none/)
  })

  it('has one red button under the preview: add your name', () => {
    const html = render('')
    const button = html.indexOf('pc-name-cta')
    expect(button).toBeGreaterThan(html.indexOf('pc-stage'))
    expect(html).toMatch(/<button[^>]*class="pc-name-cta"[^>]*>[^<]*(<[^>]*>)*[^<]*ใส่ชื่อของคุณ/)
  })

  it('holds back the tabs, the share button and the download until there is a name to share', () => {
    const html = render('')
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('pc-panel')
    expect(text(html)).not.toContain('แชร์การ์ด')
    expect(html).not.toContain('pc-primary')
  })

  it('writes ใส่ชื่อของคุณ on the card where YOUR NAME used to be', () => {
    const html = render('')
    expect(html).not.toContain('YOUR NAME')
    expect(html).toMatch(/<h2 class="pc-name[^"]*">ใส่ชื่อของคุณ<\/h2>/)
  })

  it('leaves the rest of the card as it was: starter label, dashes, no invented position', () => {
    const html = render('')
    expect(html).toContain('การ์ดเริ่มต้น')
    expect(html).toContain('—')
    expect(html).not.toMatch(/<span>(FW|MF|DF|GK)<\/span>/)
  })

  it('is worded in English too', () => {
    const html = render('', en as typeof th, 'en')
    expect(html).toContain('Add your name')
    expect(html).not.toContain('YOUR NAME')
  })

  it('says that a photo can wait', () => {
    expect(text(render(''))).toContain('เพิ่มรูปทีหลังก็ได้')
  })
})

describe('a card with a name', () => {
  it('shows the tabs and the share button, and no prompt to add a name', () => {
    const html = render('น้องตัวอย่าง')
    expect(html).toContain('role="tablist"')
    expect(text(html)).toContain('แชร์การ์ด')
    expect(html).not.toContain('pc-name-cta')
    expect(html).toContain('น้องตัวอย่าง')
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
