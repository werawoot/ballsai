import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
// The language switch on the photo half (owner's design, 23 Oct 2026) uses the app router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {} }), usePathname: () => '/login' }))
vi.mock('next/font/google', () => ({ Kaushan_Script: () => ({ className: 'font-script' }) }))
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

describe('/login first screen (owner\'s design, 23 Oct 2026; replaces the 14 Oct order)', () => {
  const html = render()
  it('opens on the sign-in / sign-up tabs, then email, then Google and Facebook as equal buttons', () => {
    const page = text(html)
    expect(page).toContain('เข้าสู่ระบบ สมัครสมาชิก')
    expect(html).toContain('id="email"')
    expect(html.indexOf('ส่งรหัสเข้าอีเมลของฉัน')).toBeLessThan(html.indexOf('หรือเข้าสู่ระบบด้วย'))
    expect(html.indexOf('หรือเข้าสู่ระบบด้วย')).toBeLessThan(html.indexOf('lg-google'))
    expect(html.indexOf('lg-google')).toBeLessThan(html.indexOf('lg-facebook'))
    expect(html).toMatch(/class="ui-btn ui-btn-white lg-facebook"[^>]*>[\s\S]*?เข้าด้วย Facebook/)
  })
  it('shows the real Google "G" in its four colours on the Google button, not a drawn circle', () => {
    const button = html.slice(html.indexOf('lg-google') - 200, html.indexOf('เข้าด้วย Google'))
    for (const colour of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) expect(button).toContain(`fill="${colour}"`)
    expect(readFileSync('app/login/login.css', 'utf8')).not.toContain('conic-gradient')
  })
  it('asks for no password and offers no sign-in that is not wired up', () => {
    expect(html).not.toContain('type="password"')
    expect(text(html)).not.toMatch(/Apple|ลืมรหัสผ่าน|จดจำฉัน/)
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
  // The email field moved onto the first screen (owner's design, 23 Oct 2026), so the one
  // consent row there sits above both the email send button and Google / Facebook.
  it('is on the first screen, which now also holds the email field', () => {
    expect(branch('start')).toContain('<LoginConsent')
    expect(branch('start')).toContain('id="email"')
    expect(source).not.toContain('{step === "email" && (')
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

// Owner, 23 Oct 2026: the photo half shows where a match goes, and the sports. Only football
// and futsal are open today, so the rest say "soon" and a line says the site starts there.
describe('/login photo half: the journey and the sports', () => {
  const page = text(render())
  it('names the five steps from playing to the Hall of Fame', () => {
    expect(page).toMatch(/ลงแข่ง[\s\S]*ผู้จัดยืนยันผล[\s\S]*การ์ดนักกีฬา[\s\S]*อันดับทั่วประเทศ[\s\S]*หอเกียรติยศ/)
  })
  it('marks only football and futsal as open and says the rest are coming', () => {
    const html = render()
    expect(html.match(/class="is-open[^"]*"/g)?.length).toBe(2)
    expect(page).toContain('บาสเกตบอล เร็ว ๆ นี้')
    expect(page).toContain('ฟุตบอล เปิดแล้ว')
    expect(page).not.toContain('ฟุตบอล เร็ว ๆ นี้')
    expect(page).toContain('เริ่มที่ฟุตบอลและฟุตซอล · กีฬาอื่นตามมา')
  })
  it('reads in English with the same honesty', () => {
    const en = text(render('en'))
    expect(en).toContain('Hall of Fame')
    expect(en).toContain('Starting with football and futsal')
  })
})

// Owner's desktop design, 23 Oct 2026: the stats bar carries only what the page was given
// (real counts from lib/home-stats loginStats), and the picture is the owner's own.
describe('/login stats bar and picture', () => {
  const withStats = (stats: unknown[]) => text(renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
    createElement(LoginPanel as ComponentType<never>, { adminEntry: false, nextPath: '/profile', stats }))))
  it('shows the provinces alone when that is all it was given, and no invented totals', () => {
    const page = withStats([{ key: 'provinces', value: 77 }])
    expect(page).toContain('จังหวัดที่รองรับ 77')
    expect(page).not.toMatch(/20K|500\+|1M/)
    expect(page).not.toContain('นักกีฬาที่มีคะแนนฝีมือ')
  })
  it('shows a real count it was given', () => {
    expect(withStats([{ key: 'athletes', value: 1240 }, { key: 'provinces', value: 77 }])).toContain('นักกีฬาที่มีคะแนนฝีมือ 1,240')
  })
  it('uses the owner\'s picture, the only one allowed by the rule 7 exception', () => {
    expect(render()).toContain('src="/photos/login-athletes-owner.webp"')
  })
})
