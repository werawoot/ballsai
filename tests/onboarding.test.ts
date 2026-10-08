import { readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { CHANGE_ROLE_PATH, CHOICES, destinationFor, goalFor, personaOf, savedAnswers, welcomeIsDone } from '@/lib/onboarding'
import { guardianStepsApply } from '@/lib/guardian-steps'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {} }), usePathname: () => '/welcome' }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
import OnboardingFlow from '@/app/welcome/OnboardingFlow'

// UX report 8 mockups 1-2: /welcome is two screens, not three. Who you are decides where you go
// (the recommended first goal of each role), so the goal screen is gone, but the answers saved
// to profiles stay what the database already accepts. No SQL change.

const allowed = (column: string) => {
  const sql = readFileSync(new URL('../sql/27-sponsor-brand-opportunities-v1.sql', import.meta.url), 'utf8')
  const block = sql.slice(sql.indexOf(`profiles_onboarding_${column}_check\n  check`))
  return [...block.slice(0, block.indexOf(']')).matchAll(/'([a-z_]+)'::text/g)].map(match => match[1])
}

describe('what the six choices save', () => {
  it('offers coach and organizer as two choices', () => {
    expect(CHOICES).toEqual(['athlete', 'guardian', 'coach', 'organizer', 'venue_owner', 'sponsor_brand'])
  })

  it('saves the persona the database knows: coach and organizer are both coach_organizer', () => {
    expect(personaOf('coach')).toBe('coach_organizer')
    expect(personaOf('organizer')).toBe('coach_organizer')
    for (const choice of CHOICES) expect(allowed('persona')).toContain(personaOf(choice))
  })

  it('saves a recommended goal that passes profiles_onboarding_goal_check', () => {
    for (const choice of CHOICES) expect(allowed('goal')).toContain(goalFor(choice))
  })

  it('takes each role to the same place as before', () => {
    expect(destinationFor('athlete')).toBe('/card')
    expect(destinationFor('guardian')).toBe('/guardian')
    expect(destinationFor('coach')).toBe('/tournaments')
    expect(destinationFor('venue_owner')).toBe('/venue')
    expect(destinationFor('sponsor_brand')).toBe('/sponsor')
  })

  it('takes someone who says they organize to ของฉัน, which shows what their account can do', () => {
    expect(destinationFor('organizer')).toBe('/profile')
  })

  it('writes the persona, sport and recommended goal together, or nothing when skipped', () => {
    expect(savedAnswers('guardian', 'football', false)).toEqual({ onboarding_persona: 'guardian', onboarding_sport: 'football', onboarding_goal: 'follow_athlete' })
    expect(savedAnswers('organizer', 'futsal', false)).toEqual({ onboarding_persona: 'coach_organizer', onboarding_sport: 'futsal', onboarding_goal: 'find_competitions' })
    expect(savedAnswers(null, 'football', true)).toEqual({ onboarding_persona: null, onboarding_sport: null, onboarding_goal: null })
  })

  it('still shows a guardian the three steps before the link form', () => {
    expect(guardianStepsApply(personaOf('guardian'), goalFor('guardian'))).toBe(true)
  })
})

describe('the first /welcome screen', () => {
  const render = (locale: 'th' | 'en') => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: locale === 'th' ? th : en, timeZone: 'Asia/Bangkok' } as never,
    createElement(OnboardingFlow as ComponentType<never>, { email: 'nong.new@example.com', nextPath: '/profile', userId: 'u1' })))
  const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

  it('asks "คุณเป็นใคร?" with one tap per role and no next button', () => {
    const html = render('th')
    const page = text(html)
    expect(page).toContain('คุณเป็นใคร?')
    for (const name of ['นักกีฬา', 'ผู้ปกครอง', 'โค้ช', 'ผู้จัดแข่ง', 'เจ้าของสนาม', 'ผู้สนับสนุน']) expect(page).toContain(name)
    expect(page).not.toContain('โค้ช / ผู้จัด')
    expect(page).not.toContain('Sponsor / Brand')
    expect(html.match(/class="ui-option( is-selected)?"/g)?.length).toBe(6)
    expect(html).not.toContain('ต่อไป')
  })

  it('does not greet a stranger with the front of their email address', () => {
    expect(text(render('th'))).not.toMatch(/nong\.new|NONG/i)
  })

  it('says it is the first of two screens', () => {
    expect(render('th')).toContain('aria-valuemax="2"')
  })

  it('tells the organizer choice that the permission comes from an administrator', () => {
    expect(text(render('th'))).toContain('ต้องให้ผู้ดูแลระบบเปิดสิทธิ์')
  })

  it('has no Thai in English, apart from the language switch that names the other language', () => {
    const html = render('en').replace(/<button[^>]*class="bds-lang-switch"[\s\S]*?<\/button>/g, '')
    expect(text(html)).not.toMatch(/[ก-ฺเ-๛]/)
    expect(text(html)).toContain('Who are you?')
  })
})

// /guardian sends someone who picked the wrong role to /welcome?again=1: there the role
// screen opens again even though onboarding was finished once.
describe('choosing a role again', () => {
  it('opens /welcome for a finished account only when asked to choose again', () => {
    expect(welcomeIsDone('2026-10-01T00:00:00Z', undefined)).toBe(true)
    expect(welcomeIsDone('2026-10-01T00:00:00Z', '1')).toBe(false)
    expect(welcomeIsDone(null, undefined)).toBe(false)
    expect(CHANGE_ROLE_PATH).toBe('/welcome?again=1')
  })
})
