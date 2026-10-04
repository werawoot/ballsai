import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import ImpactPage from '@/app/impact/page'
import { readFileSync } from 'node:fs'

const THAI = /[ก-ฺเ-๛]/
const render = (locale: Locale) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, {
    locale, messages: locale === 'th' ? th : withFallback(en, th), timeZone: 'Asia/Bangkok',
  } as never, createElement(ImpactPage)))
const text = (html: string) => html.replace(/<[^>]*>/g, '\n').split('\n').map(line => line.trim()).filter(Boolean)

describe('the impact page', () => {
  it('reads in English for an English reader', () => {
    expect(text(render('en')).filter(line => THAI.test(line))).toEqual([])
  })

  it('still reads, word for word, in Thai for a Thai reader', () => {
    const html = render('th')
    for (const phrase of ['หน้าแรก', 'เด็กที่มีฝัน', 'รอโอกาส', 'ผู้ปกครองต้องยินยอมก่อน', 'ทุกตัวเลขบอกที่มา', 'สร้างโปรไฟล์นักกีฬา', 'ดูนักกีฬาในระบบ']) {
      expect(html).toContain(phrase)
    }
  })

  it('keeps its designed header, four roles, three steps, four safety rules and the parents\' questions', () => {
    const html = render('en')
    const count = (name: string) => html.split(`class="${name}"`).length - 1
    for (const name of ['impact-back', 'impact-logo', 'impact-directory']) expect(html).toContain(`class="${name}"`)
    expect(count('im-card im-role')).toBe(4)
    expect(count('im-card im-step')).toBe(3)
    expect(count('im-safety-item')).toBe(4)
    expect(html.split('<details').length - 1).toBe(4)
  })

  it('shows the three provenance levels with the design-system chips', () => {
    const html = render('th')
    for (const chip of ['is-self', 'is-coach', 'is-performance']) expect(html).toContain(`ui-chip ${chip}`)
  })

  it('never outlines Thai headings and keeps one primary action per band', () => {
    const css = readFileSync(new URL('../app/impact/impact.css', import.meta.url), 'utf8')
    expect(css).not.toContain('text-stroke')
    const html = render('th')
    expect(html.split('im-btn im-btn-primary').length - 1).toBe(2)
  })
})
