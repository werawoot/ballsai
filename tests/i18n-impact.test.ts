import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import ImpactPage from '@/app/impact/page'

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
    for (const phrase of ['กลับหน้าแรก', 'เด็กที่มีฝัน', 'รอโอกาส', 'จุดเริ่มต้น', 'ให้คนเห็น', 'สร้างโปรไฟล์นักกีฬา', 'ดูนักกีฬาในระบบ']) {
      expect(html).toContain(phrase)
    }
  })

  it('keeps its designed header and the three numbered steps', () => {
    const html = render('en')
    for (const name of ['impact-back', 'impact-logo', 'impact-directory']) expect(html).toContain(`class="${name}"`)
    for (const step of ['01 / 03', '02 / 03', '03 / 03']) expect(html).toContain(step)
  })
})
