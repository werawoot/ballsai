import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
import LoginPanel from '@/app/login/LoginPanel'
import { LoginConsent } from '@/app/login/LoginConsent'
import { readFileSync } from 'node:fs'

// UX report 8, mockup 1: the first screen says what it is and which button to press, and shows
// no number that is not a real result. The consent row keeps its place and its exact words
// (AGENTS.md rule 9 and the owner's rule: consent wording is never edited).
const render = (locale: 'th' | 'en' = 'th', adminEntry = false) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: locale === 'th' ? th : en, timeZone: 'Asia/Bangkok' } as never,
  createElement(LoginPanel as ComponentType<never>, { adminEntry, nextPath: '/profile' })))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('/login in Thai', () => {
  const html = render()
  const page = text(html)

  it('says it is the place to sign in or sign up', () => {
    expect(page).toContain('เข้าสู่ระบบ หรือสมัครใช้งาน')
    expect(page).toContain('ใช้บัญชี Google หรืออีเมลของคุณ ไม่ต้องตั้งรหัสผ่าน')
  })

  it('names what each button does', () => {
    expect(page).toContain('เข้าด้วย Google')
    expect(page).toContain('ส่งรหัสเข้าอีเมลของฉัน')
    expect(page).toContain('เข้าด้วย Facebook')
    // Owner, 14 Oct 2026: every role signs up here, so the next step names them all.
    expect(page).toContain('ต่อไป: บอกเราว่าคุณเป็นนักกีฬา ผู้ปกครอง โค้ช หรือผู้จัด แล้วเริ่มใช้ได้ทันที')
    expect(page).not.toContain('สร้างการ์ดนักกีฬาใบแรกของคุณ')
  })

  it('no longer uses the slogan heading, the vague button or the old product words', () => {
    expect(page).not.toContain('เริ่มเส้นทางของคุณ')
    expect(page).not.toContain('รับรหัสทางอีเมล')
    expect(page).not.toMatch(/Player Card|Power Rating|Ranking/)
    expect(page).not.toContain('YOUR GAME')
  })

  it('shows no invented numbers: the example card is gone', () => {
    expect(html).not.toContain('lg-sample')
    expect(page).not.toContain('1,184')
    expect(page).not.toMatch(/POWER/)
    expect(page).not.toContain('ตัวอย่าง')
  })

  it('keeps the consent row above the buttons, with its exact words and links', () => {
    expect(page).toContain('ฉันยอมรับ ข้อกำหนดการใช้งาน และ นโยบายความเป็นส่วนตัว (PDPA)')
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
    expect(html.indexOf('lg-consent')).toBeGreaterThan(-1)
    expect(html.indexOf('lg-consent')).toBeLessThan(html.indexOf('lg-google'))
    expect(html.indexOf('lg-consent')).toBeLessThan(page.length && html.indexOf('ส่งรหัสเข้าอีเมลของฉัน'))
  })

  it('keeps the line about children and guardian consent word for word', () => {
    expect(page).toContain('ข้อมูลเด็กเปิดเผยได้เมื่อผู้ปกครองยินยอมเท่านั้น · ไม่ต้องตั้งรหัสผ่าน')
  })

  it('does not advertise the administrator form', () => {
    expect(page).not.toMatch(/ผู้ดูแล|รหัสผ่าน\s*<|PRIVATE ACCESS/)
    expect(html).not.toContain('admin-password')
  })
})

describe('/login in English', () => {
  it('reads as one sentence per button', () => {
    const page = text(render('en'))
    expect(page).toContain('Sign in or sign up')
    expect(page).toContain('Continue with Google')
    expect(page).toContain('Email me a code')
    expect(page).toContain('Continue with Facebook')
  })
})

// Owner, 13 Oct 2026: signing in is hard when the email code does not arrive. The code
// step says where to look and offers Google as the way out, in both languages.
import { OtpHelp } from '@/app/login/OtpHelp'
const help = (locale: 'th' | 'en') => text(renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: locale === 'th' ? th : en, timeZone: 'Asia/Bangkok' } as never,
  createElement(OtpHelp, { onUseGoogle: () => {} }))))

describe('/login code step: when the email does not come', () => {
  it('says how long to wait and where to look, in Thai', () => {
    const page = help('th')
    expect(page).toContain('ไม่เห็นอีเมล?')
    expect(page).toContain('Spam')
    expect(page).toContain('เข้าด้วย Google แทน')
  })

  it('says the same in English with no Thai', () => {
    const page = help('en')
    expect(page).toContain('No email?')
    expect(page).toContain('Use Google instead')
    expect(page).not.toMatch(/[ก-๛]/)
  })

  it('offers Google when codes are asked for too often', () => {
    expect(th.loginOtp.errors.rateLimited).toContain('Google')
    expect(en.loginOtp.errors.rateLimited).toContain('Google')
  })
})

describe('/login first screen: two clear ways in (owner, 14 Oct 2026)', () => {
  const html = render()
  it('keeps Google and email as the two buttons and Facebook as a quiet link below them', () => {
    expect(html.indexOf('lg-google')).toBeLessThan(html.indexOf('ส่งรหัสเข้าอีเมลของฉัน'))
    expect(html.indexOf('ส่งรหัสเข้าอีเมลของฉัน')).toBeLessThan(html.indexOf('lg-link'))
    expect(html).toMatch(/class="lg-link"[^>]*>[\s\S]*?เข้าด้วย Facebook/)
  })
  it('has a place for the consent reminder right under the consent row', () => {
    expect(html).toContain('id="login-consent-help"')
    expect(html.indexOf('lg-consent')).toBeLessThan(html.indexOf('login-consent-help'))
    expect(html.indexOf('login-consent-help')).toBeLessThan(html.indexOf('lg-google'))
  })
})

// Owner, 15 Oct 2026: a password field should let you see what you typed. The admin form
// (/login?admin=1) starts hidden, with a labelled toggle that says whether it is showing.
describe('/login?admin=1 password field', () => {
  const html = render('th', true)
  it('starts hidden, with a show-password button that says its state', () => {
    expect(html).toMatch(/id="admin-password"[^>]*type="password"|type="password"[^>]*id="admin-password"/)
    expect(html).toMatch(/<button[^>]*aria-controls="admin-password"[^>]*aria-label="แสดงรหัสผ่าน"[^>]*aria-pressed="false"|<button[^>]*aria-label="แสดงรหัสผ่าน"[^>]*aria-pressed="false"[^>]*aria-controls="admin-password"/)
  })
})

// Owner, 18 Oct 2026: the consent row was only on the first screen. Choosing "email" without
// ticking it led to a send button that did nothing, because the row it pointed at was gone.
// The same row, same words (AGENTS.md: consent wording is never edited), on every screen that
// sends a code or signs in.
describe('/login consent row on each screen that signs in', () => {
  const source = readFileSync('app/login/LoginPanel.tsx', 'utf8')
  const branch = (step: string) => source.slice(source.indexOf(`{step === "${step}" && (`), source.indexOf('</>', source.indexOf(`{step === "${step}" && (`)))
  it('is on the first screen and on the email screen', () => {
    expect(branch('start')).toContain('<LoginConsent')
    expect(branch('email')).toContain('<LoginConsent')
  })
  it('keeps its exact words and its links on the first screen', () => {
    const html = render()
    expect(text(html)).toContain('ฉันยอมรับ ข้อกำหนดการใช้งาน และ นโยบายความเป็นส่วนตัว (PDPA)')
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
  })
  it('names the missing tick for screen readers', () => {
    const html = renderToStaticMarkup(createElement(LoginConsent, { accepted: false, missing: true, missingText: 'x', onChange: () => {} }, 'terms'))
    expect(html).toContain('id="login-consent"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-invalid="true"')
  })
})
