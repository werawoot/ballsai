import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import MyEventsPanel, { type MyEventRow } from '@/app/team-members/MyEventsPanel'

// The athlete's and guardian's answer list (sql/70): one row per event and child, the
// current answer marked, and "for <name>" only on a child's row.
const row = (over: Partial<MyEventRow>): MyEventRow => ({
  event_id: 'e1', team_name: 'ขอนแก่น U13', kind: 'training', title: 'ซ้อมเย็นวันพุธ', starts_at: '2026-10-14T10:00:00Z',
  location: 'สนามโรงเรียน', athlete_id: 'me', athlete_name: 'ต้น', answer: null, ...over,
})
const render = (rows: MyEventRow[], viewerId = 'me') => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, createElement(MyEventsPanel, { rows, viewerId })))

describe('MyEventsPanel', () => {
  it('renders nothing when there is nothing to answer', () => {
    expect(render([])).toBe('')
  })

  it('shows the event in Bangkok time with both answers and marks the chosen one', () => {
    const html = render([row({ answer: 'yes' })])
    expect(html).toContain('ซ้อมเย็นวันพุธ')
    expect(html).toContain('พ. 14/10 · 17:00 น.')
    expect(html).toContain(th.teamEvents.yes)
    expect(html).toContain(th.teamEvents.no)
    expect(html).toMatch(/aria-pressed="true"[^>]*>มาได้</)
    expect(html).not.toContain('สำหรับ')
  })

  it('names the child on a guardian row', () => {
    const html = render([row({ athlete_id: 'child', athlete_name: 'ปาล์ม' })], 'guardian')
    expect(html).toContain('สำหรับ ปาล์ม')
  })
})
