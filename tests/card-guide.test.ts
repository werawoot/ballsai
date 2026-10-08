import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import CardGuide from '@/components/CardGuide'
import { calculateLevel } from '@/lib/digital-identity'

// Owner, 8 Oct 2026 ("ทำข้อ 1"): testers will ask why a new card has no numbers. One closed
// "what is this?" box answers it on /card and /profile, with the rules the system really uses.
const render = (messages: typeof th) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale: 'th', messages, timeZone: 'Asia/Bangkok' } as never, createElement(CardGuide)))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('the card guide', () => {
  it('is a closed box that opens on tap, so it never pushes the card down', () => {
    const html = render(th)
    expect(html).toMatch(/^<details/)
    expect(html).not.toContain(' open')
    expect(text(html)).toContain(th.cardGuide.summary)
  })

  it('explains the starter card, power, XP, badges, skills and where data comes from', () => {
    const page = text(render(th))
    for (const key of ['starter', 'power', 'xp', 'badges', 'skills', 'source'] as const) {
      expect(page).toContain(th.cardGuide[key].title)
      expect(page).toContain(th.cardGuide[key].text)
    }
  })

  it('states the numbers the system uses, not made-up ones', () => {
    // lib/rating.ts STARTING_RATING and MAX_RATING; sql/digital-identity-v1.sql XP per event.
    expect(th.cardGuide.power.text).toContain('1,000')
    expect(th.cardGuide.power.text).toContain('3,000')
    for (const amount of ['30', '20', '10', '8', '15', '35']) expect(th.cardGuide.xp.text).toContain(amount)
    // Levels: 1 + floor(sqrt(xp / 100)).
    expect(calculateLevel(99)).toBe(1)
    expect(calculateLevel(100)).toBe(2)
    expect(calculateLevel(400)).toBe(3)
    expect(th.cardGuide.xp.text).toContain('100 แต้ม')
    expect(th.cardGuide.xp.text).toContain('400 แต้ม')
    // Training never gives match XP (sql/63-training-v1.sql), and the guide says so.
    expect(th.cardGuide.xp.text).toContain('ซ้อม')
  })

  it('has the same sections in English', () => {
    expect(Object.keys(en.cardGuide).sort()).toEqual(Object.keys(th.cardGuide).sort())
  })

  it('sits on /card and on /profile', () => {
    expect(readFileSync('app/card/page.tsx', 'utf8')).toContain('<CardGuide')
    expect(readFileSync('app/profile/page.tsx', 'utf8')).toContain('<CardGuide')
  })
})

// Owner, 8 Oct 2026 ("ทำข้อ 2"): the English labels left on pages testers open.
describe('Thai words, batch 3', () => {
  it('card colours come from messages', () => {
    const source = readFileSync('app/card/PlayerCardBuilder.tsx', 'utf8')
    expect(source).not.toMatch(/'Red'|'Gold'|'Ice'/)
    for (const key of ['red', 'gold', 'ice'] as const) expect(th.card.themes[key]).toMatch(/[฀-๿]/)
  })

  it('no back link says "Dashboard" and the organizer hero is Thai', () => {
    for (const file of ['app/match-plan/page.tsx', 'app/dashboard/tournaments/[id]/edit/page.tsx', 'app/dashboard/results/page.tsx', 'app/dashboard/create/page.tsx']) {
      expect(readFileSync(file, 'utf8')).not.toContain("label: 'Dashboard'")
    }
    expect(readFileSync('app/dashboard/page.tsx', 'utf8')).not.toContain('ORGANIZER')
    expect(th.labels.dashboardLabels.back).toMatch(/[฀-๿]/)
  })

  it('the venues tagline and the delete-my-data list are Thai', () => {
    expect(readFileSync('app/venues/page.tsx', 'utf8')).not.toContain('PLAY WHERE IT MATTERS')
    expect(th.venues.eyebrow).toMatch(/[฀-๿]/)
    expect(readFileSync('app/profile/DeleteMyDataSection.tsx', 'utf8')).not.toMatch(/\b(Highlight|Level|Badge)\b/)
  })
})
