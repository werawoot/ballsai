import { type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The glass home page (ADR-014): real rows only, numbers only once they mean something,
// no adverts (ADR-012), and the sports that are not built yet marked as coming.
const data = vi.hoisted(() => ({
  tournaments: [] as Record<string, unknown>[],
  ranks: [] as Record<string, unknown>[],
  counts: { tournaments: 0, openTournaments: 0, athletes: 0, results: 0 },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'th' }))
vi.mock('@/lib/sample-data', () => ({ sampleTournaments: [], samplePlayerRanks: [], isSampleId: () => false, showDemoData: false }))
vi.mock('@/lib/public-data', () => ({
  getPublicOpenTournaments: async () => data.tournaments,
  getPublicRankings: async () => data.ranks,
  getPublicPlatformCounts: async () => data.counts,
}))

import Home from '@/app/page'

const render = async () => renderToStaticMarkup(await (Home as () => Promise<ReactElement>)())
const cup = (id: string, name: string, start: string) => ({ id, name, location: 'สนามกีฬากลาง ขอนแก่น', start_date: start, end_date: start, fee: 500, max_teams: 8, status: 'open' })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T03:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('home page', () => {
  it('leads with the next open tournament that is not over, with its countdown and one way in', async () => {
    data.tournaments = [cup('old', 'รายการที่จบแล้ว', '2026-09-01'), cup('t1', 'ศึกเยาวชนขอนแก่น', '2026-10-24')]
    const html = await render()
    const card = html.slice(html.indexOf('id="hm-next-name"') - 400, html.indexOf('ดูรายละเอียดและสมัคร'))
    expect(card).toContain('ศึกเยาวชนขอนแก่น')
    expect(card).toContain('อีก 12 วัน')
    expect(html).not.toContain('รายการที่จบแล้ว')
    expect(html).toContain('href="/tournaments/t1"')
  })

  it('explains the platform in three steps when no tournament is open, instead of an empty space', async () => {
    data.tournaments = []
    const html = await render()
    expect(html).not.toContain('id="hm-next-name"')
    expect(html).toContain('เริ่มต้นใน 3 ขั้น')
    expect(html).toMatch(/สร้างทีม[\s\S]*ลงแข่ง[\s\S]*ผลขึ้นการ์ดนักกีฬา/)
    expect(html).toContain('href="/login"')
  })

  it('shows the three steps only when there is no next tournament to show', async () => {
    data.tournaments = [cup('t1', 'ศึกเยาวชนขอนแก่น', '2026-10-24')]
    expect(await render()).not.toContain('เริ่มต้นใน 3 ขั้น')
  })

  it('hides the platform numbers while they are small, and shows real ones once they are not', async () => {
    data.counts = { tournaments: 3, openTournaments: 1, athletes: 12, results: 2 }
    expect(await render()).not.toContain('ตัวเลขของระบบ')
    data.counts = { tournaments: 40, openTournaments: 6, athletes: 1200, results: 310 }
    const html = await render()
    expect(html).toContain('ตัวเลขของระบบ')
    expect(html).toContain('1,200')
  })

  it('carries no advert space and no made-up highlights', async () => {
    const html = await render()
    expect(html).not.toContain('โฆษณา</span>')
    expect(html).not.toMatch(/พื้นที่สำหรับโฆษณา|HIGHLIGHTS|02:18/)
  })

  it('marks every sport but football as coming soon, with no link', async () => {
    const html = await render()
    expect(html).toMatch(/<a[^>]*class="hm-sport is-on"[^>]*>[\s\S]*?<span>ฟุตบอล<\/span>[\s\S]*?<\/a>/)
    expect(html).toMatch(/<span class="hm-sport is-soon">[\s\S]*?<span>ฟุตซอล<\/span><small class="hm-soon">เร็ว ๆ นี้<\/small><\/span>/)
    expect(html).not.toMatch(/<a[^>]*>[^<]*ฟุตซอล/)
  })

  it('lists every other sport behind "กีฬาอื่น ๆ", all marked as coming and none linked', async () => {
    const html = await render()
    const panel = html.slice(html.indexOf('class="hm-more"'), html.indexOf('</details>'))
    expect(panel).toContain('กำลังจะมาทุกกีฬา')
    for (const sport of ['เซปักตะกร้อ', 'มวยไทย', 'กรีฑา', 'ว่ายน้ำ']) expect(panel).toContain(`<li>${sport}</li>`)
    expect(panel).not.toContain('<a ')
  })

  it('counts open tournaments on the football chip only once there are a few', async () => {
    data.counts = { tournaments: 3, openTournaments: 2, athletes: 0, results: 0 }
    expect(await render()).not.toContain('hm-sport-count')
    data.counts = { tournaments: 3, openTournaments: 7, athletes: 0, results: 0 }
    expect(await render()).toContain('· 7 รายการ')
  })

  it('says how the ranking is earned, and shows nothing invented when it is empty', async () => {
    data.ranks = []
    const html = await render()
    expect(html).toContain('คะแนนฝีมือจากผลแข่งที่ผู้จัดยืนยันเท่านั้น')
    expect(html).toContain('อันดับจะขึ้นเมื่อมีผลแข่งที่ผู้จัดยืนยันแล้ว')
  })
})
