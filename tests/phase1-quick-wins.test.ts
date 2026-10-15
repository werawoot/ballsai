import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
import HomeHeroCarousel, { autoAdvances } from '@/app/HomeHeroCarousel'
import TeamMembersClient from '@/app/team-members/TeamMembersClient'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const withIntl = (node: ReturnType<typeof createElement>, locale: 'th' | 'en' = 'th') =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: locale === 'th' ? th : en, timeZone: 'Asia/Bangkok' } as never, node))

// Report 11, Phase 1 (owner approved "ทำเลย", 15 Oct 2026).
describe('home carousel: moving content can be stopped', () => {
  const html = renderToStaticMarkup(createElement(HomeHeroCarousel))
  it('has a pause button that says what it does', () => {
    expect(html).toMatch(/<button[^>]*aria-label="หยุดเลื่อนสไลด์อัตโนมัติ"/)
    expect(html).toMatch(/aria-pressed="false"/)
  })
  it('never moves by itself when paused or when the device asks for less motion', () => {
    expect(autoAdvances({ paused: false, reducedMotion: false })).toBe(true)
    expect(autoAdvances({ paused: true, reducedMotion: false })).toBe(false)
    expect(autoAdvances({ paused: false, reducedMotion: true })).toBe(false)
  })
})

describe('home red is the brand red (AGENTS.md rule 7, owner approved)', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  it('uses #CC0001 for the home page and the shared red', () => {
    expect(css).toMatch(/--red: #CC0001;/)
    expect(css).toMatch(/\.home-page \{[^}]*--red-hot: #CC0001;/)
    expect(css).not.toMatch(/\.home-page \{[^}]*#d71920/)
  })
})

describe('/team-members: a coach names themselves before inviting', () => {
  const team = { id: 'tm1', name: 'Lions', tournament_id: null, status: 'draft', tournaments: null }
  const render = (myName: string | null, locale: 'th' | 'en' = 'th') => withIntl(createElement(TeamMembersClient as ComponentType<never>, { teams: [team], invites: [], counts: { tm1: { accepted: 0, pending: 0 } }, myName } as never), locale)
  it('asks for the name families will see, above the invite form', () => {
    const html = render(null)
    expect(text(html)).toContain('ครอบครัวนักกีฬาจะเห็นชื่อนี้')
    expect(html).toContain('id="my-display-name"')
    expect(html.indexOf('my-display-name')).toBeLessThan(html.indexOf('name@example.com'))
  })
  it('says nothing once the coach has a name', () => {
    expect(render('โค้ชท็อป')).not.toContain('my-display-name')
  })
  it('speaks English with no Thai', () => {
    expect(text(render(null, 'en'))).not.toMatch(/[ก-๛]/)
  })
})
