import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

import SessionRunner from '@/app/training/[programId]/session/SessionRunner'

// UX mockup v5-B: the first question of every session is about pain. The two answers are
// two equal buttons, neither one is the red primary, and no button starts out focused: the
// sheet itself is focused, so a keyboard or screen-reader user lands in it but is not
// steered to "no pain". The wording is unchanged until the owner's expert has checked it.
const render = (messages: typeof th, locale: string) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale, messages, timeZone: 'Asia/Bangkok' } as never,
  createElement(SessionRunner as ComponentType<never>, {
    programId: 'u10-foundation-01', enrollmentId: 'e1', userId: 'me', today: '2026-10-06', plannedToday: true, alreadyDone: false,
    drills: [{ id: 'a1-react-jog', name: 'Jog', dose: '2 min', seconds: 120, image: '/training/drills/a1-react-jog.webp' }],
    heading: { code: 'X', title: 'Warm-up', week: 'Week 1' }, after: { done: 0, total: 16, streak: 0, next: null },
  } as never)))
const dialog = (html: string) => html.slice(html.indexOf('role="dialog"'), html.indexOf('</div></div>', html.indexOf('role="dialog"')))

describe('the pain question at the start of a session', () => {
  it('has two buttons of equal weight and neither is the primary one', () => {
    const sheet = dialog(render(th, 'th'))
    const buttons = [...sheet.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)]
    expect(buttons.map(match => match[2])).toEqual(['ไม่เจ็บ เริ่มซ้อม', 'เจ็บ'])
    expect(buttons.every(match => match[1].includes('ui-btn-ghost'))).toBe(true)
    expect(sheet).not.toContain('ui-btn-primary')
  })

  it('keeps the question and the advice word for word', () => {
    const sheet = dialog(render(th, 'th'))
    expect(sheet).toContain('ตอนนี้มีอาการเจ็บไหม?')
    expect(sheet).toContain('ถ้าเจ็บระหว่างซ้อม ให้หยุดและบอกผู้ปกครองหรือโค้ช')
  })

  it('focuses the sheet, not an answer', () => {
    const html = render(th, 'th')
    expect(html).toMatch(/class="tr-gate-sheet"[^>]*tabindex="-1"|tabindex="-1"[^>]*class="tr-gate-sheet"/)
    expect(dialog(html)).not.toMatch(/autofocus/i)
  })

  it('is the same in English', () => {
    const sheet = dialog(render(en as typeof th, 'en'))
    expect(sheet).not.toContain('ui-btn-primary')
  })
})
