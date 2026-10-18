import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import MyEntriesPanel from '@/app/team-members/MyEntriesPanel'
import TeamNotFound from '@/app/team-members/[teamId]/not-found'
import type { EntryRosterRow } from '@/lib/own-team'

// QA B on Production, 18 Oct 2026, the athlete's side.
const intl = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, child))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('a team page the viewer may not open', () => {
  it('says it is the coach\'s page and leads back to my teams, not "field not found"', () => {
    const html = intl(createElement(TeamNotFound))
    expect(text(html)).toContain(th.teamPage.notFoundTitle)
    expect(text(html)).toContain(th.teamPage.notFoundBody)
    expect(html).toContain('href="/team-members"')
    expect(text(html)).not.toContain('สนามที่กำลังหา')
  })
})

describe('withdrawing from a tournament entry', () => {
  const row = { member_id: 'm1', entry_team_id: 't2', team_name: 'QA ทดสอบ 18ตค', tournament_name: 'BallDoenSai ทดสอบรอบแรก', athlete_id: 'me', athlete_name: null, status: 'accepted', can_withdraw: true } as unknown as EntryRosterRow
  it('says what withdrawing does next to the button', () => {
    const page = text(intl(createElement(MyEntriesPanel, { rows: [row], viewerId: 'me' })))
    expect(page).toContain(th.ownTeam.withdraw)
    expect(page).toContain(th.ownTeam.withdrawHint)
  })
  it('does not explain a button that is not there', () => {
    const page = text(intl(createElement(MyEntriesPanel, { rows: [{ ...row, can_withdraw: false } as EntryRosterRow], viewerId: 'me' })))
    expect(page).not.toContain(th.ownTeam.withdrawHint)
  })
})

describe('the profile team card link', () => {
  const source = readFileSync('app/profile/page.tsx', 'utf8')
  it('says "invitations" only when one is waiting, otherwise "my teams"', () => {
    expect(source).toMatch(/pendingTeamInvites > 0 \? t\('teams\.viewAll'\) : t\('teams\.viewTeams'\)/)
    expect(th.profileHome.teams.viewTeams).toBe('ดูทีมของฉัน')
  })
})
