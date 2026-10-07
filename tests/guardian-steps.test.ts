import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import { guardianStepsApply } from '@/lib/guardian-steps'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }))

import GuardianLinksClient from '@/app/guardian/GuardianLinksClient'

// A parent cannot link a child who has no account yet: request_guardian_link (sql/21) needs
// the athlete's account and an athlete profile (ATHLETE_PROFILE_REQUIRED). So a parent with
// no linked child is told the order before the form: the child signs up first, the parent asks
// for the link with the child's login email, the child accepts. The consent wording is not
// touched (UX request ข).
const STEPS = ['น้องสมัครบัญชีและทำโปรไฟล์ก่อน', 'ผู้ปกครองใส่อีเมลที่น้องใช้ล็อกอินเพื่อขอเชื่อม', 'น้องกดยอมรับในบัญชีของน้อง']
const render = (props: Record<string, unknown>, messages = th as typeof th, locale = 'th') => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale, messages, timeZone: 'Asia/Bangkok' } as never, createElement(GuardianLinksClient as ComponentType<never>, props as never)))
const link = (status: string) => ({ id: `l-${status}`, status, requested_at: '2026-10-01', athlete: { display_name: 'น้องตัวอย่าง', is_public: false } })

describe('where the three steps apply', () => {
  it('only to a guardian who is choosing to follow an athlete', () => {
    expect(guardianStepsApply('guardian', 'follow_athlete')).toBe(true)
    expect(guardianStepsApply('guardian', 'find_competitions')).toBe(false)
    expect(guardianStepsApply('athlete', 'follow_athlete')).toBe(false)
    expect(guardianStepsApply(null, 'follow_athlete')).toBe(false)
  })
})

describe('/guardian for a parent with no linked child', () => {
  it('lists the three steps, in order, before the form', () => {
    const html = render({ isGuardian: true, links: [], incoming: [] })
    const at = STEPS.map(step => html.indexOf(step))
    expect(at.every(index => index > -1)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(Math.max(...at)).toBeLessThan(html.indexOf('type="email"'))
  })

  it('also when earlier requests were declined or revoked', () => {
    expect(render({ isGuardian: true, links: [link('declined'), link('revoked')], incoming: [] })).toContain(STEPS[0])
  })

  it('not once a child is linked or a request is waiting for the child', () => {
    expect(render({ isGuardian: true, links: [link('accepted')], incoming: [] })).not.toContain(STEPS[0])
    expect(render({ isGuardian: true, links: [link('pending')], incoming: [] })).not.toContain(STEPS[0])
  })

  it('not for someone who is not a guardian (there is no form to explain)', () => {
    expect(render({ isGuardian: false, links: [], incoming: [] })).not.toContain(STEPS[0])
  })

  it('leaves the consent wording and its checkbox where they were', () => {
    const html = render({ isGuardian: true, links: [], incoming: [] })
    expect(html).toContain('ผู้ปกครองต้องยืนยันความยินยอมก่อนส่งคำขอ')
    expect(html).toContain('ฉันเป็นผู้ปกครองหรือผู้มีอำนาจดูแล')
    expect(html.indexOf('type="email"')).toBeLessThan(html.indexOf('type="checkbox"'))
  })

  it('says the same in English', () => {
    const html = render({ isGuardian: true, links: [], incoming: [] }, en as typeof th, 'en')
    expect(html).toContain('Your child signs up and sets up their profile first')
    expect(html).toContain('Your child accepts in their own account')
  })
})
