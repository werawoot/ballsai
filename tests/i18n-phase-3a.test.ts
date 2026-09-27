import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import { unreadBadge } from '@/lib/notification-unread'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

import NotFound from '@/app/not-found'
import GlobalError from '@/app/error'
import NotificationList from '@/app/notifications/NotificationList'
import NotificationBellLink from '@/components/NotificationBellLink'
import RankingFilter from '@/app/ranking/RankingFilter'
import AthleteFilters from '@/app/athletes/AthleteFilters'
import LoadingModal from '@/components/LoadingModal'

// ADR-009 phase 3a: screens every visitor can meet -- the 404 and error pages,
// notifications, and the discovery filters. Rendered in English, none may show Thai the
// visitor did not bring: notification titles and province names are data, not UI.

const THAI = /[ก-ฺเ-๛]/
const render = (locale: Locale, component: ComponentType<never>, props: object) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, {
    locale,
    messages: locale === 'th' ? th : withFallback(en, th),
    timeZone: 'Asia/Bangkok',
  } as never, createElement(component, props as never)))
const readable = (html: string) => [
  ...html.replace(/<[^>]*>/g, '\n').split('\n'),
  ...[...html.matchAll(/(?:placeholder|aria-label|alt|title)="([^"]*)"/g)].map(match => match[1]),
].map(text => text.trim()).filter(Boolean)
const thaiIn = (html: string, data: string[] = []) =>
  readable(html).filter(text => THAI.test(text) && !data.some(value => text.includes(value)))

const notifications = [
  { id: 'n1', title: 'มีผลการแข่งขันใหม่ในระบบ', body: 'ข้อความจากระบบ', href: null, read_at: null, created_at: '2026-09-27T09:00:00Z' },
  { id: 'n2', title: 'Badge', body: 'x', href: '/career', read_at: '2026-09-27T10:00:00Z', created_at: '2026-09-26T09:00:00Z' },
]
const DATA = ['มีผลการแข่งขันใหม่ในระบบ', 'ข้อความจากระบบ', 'กรุงเทพมหานคร']

const SCREENS: Array<[string, ComponentType<never>, object]> = [
  ['404 page', NotFound as ComponentType<never>, {}],
  ['error page', GlobalError as ComponentType<never>, { error: new Error('x'), reset: () => {} }],
  ['notification list', NotificationList as ComponentType<never>, { notifications }],
  ['empty notification list', NotificationList as ComponentType<never>, { notifications: [] }],
  ['notification bell with unread', NotificationBellLink as ComponentType<never>, { unreadCount: 3 }],
  ['notification bell', NotificationBellLink as ComponentType<never>, { unreadCount: 0 }],
  ['ranking filter', RankingFilter as ComponentType<never>, { provinces: ['กรุงเทพมหานคร'], currentProvince: '', currentPosition: '', currentSearch: '' }],
  ['athlete filters', AthleteFilters as ComponentType<never>, { provinces: ['กรุงเทพมหานคร'], currentSearch: '', currentProvince: '', currentPosition: '', currentAge: '' }],
  ['loading modal', LoadingModal as ComponentType<never>, { isOpen: true }],
]

describe('screens any visitor can meet, in English', () => {
  it.each(SCREENS)('%s shows no Thai UI text', (_name, component, props) => {
    expect(thaiIn(render('en', component, props), DATA)).toEqual([])
  })

  it.each(SCREENS)('%s still reads in Thai for a Thai user', (_name, component, props) => {
    expect(thaiIn(render('th', component, props), DATA).length).toBeGreaterThan(0)
  })

  it('keeps notification titles and province names exactly as stored', () => {
    expect(render('en', NotificationList as ComponentType<never>, { notifications })).toContain('มีผลการแข่งขันใหม่ในระบบ')
    expect(render('en', RankingFilter as ComponentType<never>, SCREENS[6][2])).toContain('กรุงเทพมหานคร')
  })

  it('writes notification dates in the reader\'s language', () => {
    const english = render('en', NotificationList as ComponentType<never>, { notifications })
    const thai = render('th', NotificationList as ComponentType<never>, { notifications })
    expect(english).toMatch(/Sep 27, 2026/)
    expect(thai).toMatch(/27 ก\.ย\. 2569/)
  })

  it('names the unread count in both languages, and no longer carries Thai in the lib', () => {
    expect(unreadBadge(4)).toEqual({ text: '4', count: 4 })
    expect(render('en', NotificationBellLink as ComponentType<never>, { unreadCount: 4 })).toContain('aria-label="Notifications · 4 unread"')
  })
})
