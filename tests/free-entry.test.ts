import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }))

import PaymentStep from '@/app/tournaments/[id]/PaymentStep'
import { RegisterSteps } from '@/app/tournaments/[id]/RegisterSteps'

// Claude Desktop readiness test, 8 Oct 2026: the free 24 Oct tournament still asked the
// coach for a slip, and its submit button stayed grey until a picture was chosen.
const summary = { day: '24', month: 'ต.ค.', name: 'Cup', line: 'ฟรี' }
const wrap = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, element))
const payment = (fee: string | null, teamStatus: string | null) => wrap(createElement(PaymentStep, { tournamentId: 't1', teamId: 'team1', teamName: 'ทีมเอ', teamStatus, fee, promptpay: null, summary }))

describe('entering a free tournament', () => {
  it('a submitted team is told it is waiting for the organizer, with no slip to attach', () => {
    const html = payment(null, 'pending')
    expect(html).toContain(th.tournament.freeDoneTitle)
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain(th.tournament.slipTitle)
  })

  it('a team not submitted yet is sent back to /team-members to submit it', () => {
    const html = payment(null, 'draft')
    expect(html).toContain('href="/team-members"')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain(th.tournament.freeDoneTitle)
  })

  it('a paid tournament still asks for the slip', () => {
    const html = payment('฿1,500', 'pending')
    expect(html).toContain('type="file"')
    expect(html).toContain(th.tournament.slipTitle)
  })

  it('the step bar says submit, not pay, when the tournament is free', () => {
    expect(wrap(createElement(RegisterSteps, { current: 2, free: true }))).toContain(th.tournament.steps.submitFree)
    expect(wrap(createElement(RegisterSteps, { current: 2, free: true }))).not.toContain(th.tournament.steps.pay)
    expect(wrap(createElement(RegisterSteps, { current: 2 }))).toContain(th.tournament.steps.pay)
  })

  it('every free wording exists in Thai and English and none mentions a slip', () => {
    for (const messages of [th, en]) {
      const free = [messages.tournament.steps.submitFree, messages.tournament.how.submitFree.title, messages.tournament.how.submitFree.text,
        messages.tournament.teamNextFree, messages.tournament.freeDoneTitle, messages.tournament.freeDoneText, messages.teamRoster.submitFree]
      for (const line of free) {
        expect(line).toBeTruthy()
        expect(line).not.toMatch(/สลิป|slip|ชำระ|pay/i)
      }
    }
  })
})

describe('fixtures switched off', () => {
  it('tells the organizer and the public in plain words, with no database step number', () => {
    for (const messages of [th, en]) {
      for (const line of [messages.apiErrors.fixturesMigrationMissing, messages.apiErrors.fixtureResultsMigrationMissing,
        messages.apiErrors.fixturesPublishMigrationMissing, messages.fixtures.migrationMissing]) expect(line).not.toMatch(/SQL|database|ฐานข้อมูล/i)
      expect(messages.fixtures.recordInstead).toBeTruthy()
    }
  })
})
