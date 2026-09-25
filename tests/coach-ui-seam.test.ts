import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// A bare server render has no app-router context. The router is not what these
// assertions are about, so stand it in.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import CoachTeamOverview from '@/app/team-members/CoachTeamOverview'
import CoachRosterActions from '@/app/team-members/CoachRosterActions'
import AthleteAttestationInbox from '@/app/team-members/AthleteAttestationInbox'
import { COACH_VERIFIED_FIELD_LABEL, POSITION_LABELS, attestationKey, type CoachTeamView } from '@/lib/coach-team-overview'

// What these tests prove and do not prove:
//   * They server-render the component once and assert the INITIAL accessible markup:
//     text, aria-label, aria-busy, disabled, and which controls exist at all.
//   * They do NOT exercise clicking, focus, state transitions after an event, or the
//     fetch calls those events make. There is no DOM or browser driver here.
//   * State DECISIONS are proven separately as pure helpers in
//     tests/coach-attestation-state.test.ts and tests/pending-action.test.ts.
//   * Real interaction remains a manual Closed Beta gate until a DOM/browser test is
//     added. Do not read a passing suite here as proof that a button works.
const html = (component: Parameters<typeof createElement>[0], props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(component as never, props as never))

const view = (over: Partial<CoachTeamView> = {}): CoachTeamView => ({
  id: 'team-1', name: 'ทีมลุงหมี', status: 'draft', tournamentName: 'BDS Cup',
  members: [
    { id: 'm1', athleteId: 'a1', name: 'น้องเอ', status: 'accepted', invitedAt: '2026-09-01T00:00:00Z' },
    { id: 'm2', athleteId: 'a2', name: 'น้องบี', status: 'pending', invitedAt: '2026-09-02T00:00:00Z' },
    { id: 'm3', athleteId: 'a3', name: 'น้องซี', status: 'declined', invitedAt: '2026-09-03T00:00:00Z' },
  ],
  counts: { accepted: 1, pending: 1, declined: 1, removed: 0 },
  canManageRoster: true,
  nextAction: 'ส่งรายชื่อทีมให้ผู้จัดรายการ',
  organizerOnly: ['บันทึกผลการแข่งขันและยืนยันผล'],
  ...over,
})

describe('CoachTeamOverview rendering', () => {
  it('shows every member with its invitation state', () => {
    const markup = html(CoachTeamOverview, { teams: [view()] })

    for (const name of ['น้องเอ', 'น้องบี', 'น้องซี']) expect(markup).toContain(name)
    expect(markup).toContain('ตอบรับแล้ว')
    expect(markup).toContain('รอตอบรับ')
    expect(markup).toContain('ปฏิเสธ')
  })

  it('says plainly what the organizer does, not the coach', () => {
    expect(html(CoachTeamOverview, { teams: [view()] })).toContain('บันทึกผลการแข่งขัน')
  })

  it('reports a failed roster query instead of rendering an empty roster', () => {
    // A query error and a genuinely empty team must not look the same.
    const markup = html(CoachTeamOverview, { teams: [view({ members: [] })], rosterError: true })

    expect(markup).toContain('โหลดรายชื่อสมาชิกไม่สำเร็จ')
    expect(markup).not.toContain('ยังไม่มีสมาชิก')
  })

  it('says a team is genuinely empty when the query succeeded', () => {
    const markup = html(CoachTeamOverview, {
      teams: [view({ members: [], counts: { accepted: 0, pending: 0, declined: 0, removed: 0 } })],
    })

    expect(markup).toContain('ยังไม่มีสมาชิก')
    expect(markup).not.toContain('โหลดรายชื่อสมาชิกไม่สำเร็จ')
  })

  it('never shows an anonymous placeholder roster when the query failed', () => {
    const markup = html(CoachTeamOverview, { teams: [view({ members: [] })], rosterError: true })

    expect(markup).not.toContain('นักกีฬา<')
  })
})

describe('CoachRosterActions rendering', () => {
  const props = { teamId: 'team-1', members: view().members, canManageRoster: true }

  it('offers a remove control for every member, each with an accessible name', () => {
    const markup = html(CoachRosterActions, props)

    // An accepted member's control says it will ask first (see the confirmation test).
    expect(markup).toContain('aria-label="นำน้องเอออกจากทีม ต้องยืนยันก่อน"')
    expect(markup).toContain('aria-label="นำน้องบีออกจากทีม"')
    expect(markup).toContain('aria-label="นำน้องซีออกจากทีม"')
  })

  it('offers the structured position attestation with only the allowed values', () => {
    const markup = html(CoachRosterActions, props)

    for (const position of Object.keys(POSITION_LABELS)) {
      expect(markup).toContain(`value="${position}"`)
    }
    // No free-text claim field may exist.
    expect(markup).not.toContain('name="claim"')
    expect(markup).toContain('name="position"')
  })

  it('only offers the attestation for a member who accepted the invitation', () => {
    const markup = html(CoachRosterActions, props)

    expect(markup).toContain('aria-label="รับรองตำแหน่งการเล่นของน้องเอ"')
    expect(markup).not.toContain('รับรองตำแหน่งการเล่นของน้องบี')
  })

  it('says it verifies the playing position, never the whole profile', () => {
    const markup = html(CoachRosterActions, props)

    expect(markup).toContain(COACH_VERIFIED_FIELD_LABEL)
    for (const overclaim of ['ยืนยันตัวตน', 'รับรองโปรไฟล์', 'รับรองความสามารถ', 'รับรองสถิติ', 'รับรองผลงาน']) {
      expect(markup, `${overclaim} overstates what a coach confirmed`).not.toContain(overclaim)
    }
  })

  it('shows the current attestation state for each member', () => {
    const markup = html(CoachRosterActions, {
      ...props,
      attestations: {
        [attestationKey('team-1', 'a1', 'playing_position')]: { id: 'x', status: 'pending' as const, claimedValue: 'GK', createdAt: '' },
      },
    })

    expect(markup).toContain('รอนักกีฬาตอบ')
  })

  it('does not offer the form again while an attestation is pending', () => {
    const markup = html(CoachRosterActions, {
      ...props,
      attestations: { [attestationKey('team-1', 'a1', 'playing_position')]: { id: 'x', status: 'pending' as const, claimedValue: 'GK', createdAt: '' } },
    })

    expect(markup).not.toContain('name="position"')
  })

  it('does not offer the form again once the athlete accepted', () => {
    const markup = html(CoachRosterActions, {
      ...props,
      attestations: { [attestationKey('team-1', 'a1', 'playing_position')]: { id: 'x', status: 'accepted' as const, claimedValue: 'DF', createdAt: '' } },
    })

    expect(markup).toContain('รับรองแล้ว')
    expect(markup).not.toContain('name="position"')
  })

  it('offers the form again after the athlete declined', () => {
    const markup = html(CoachRosterActions, {
      ...props,
      attestations: { [attestationKey('team-1', 'a1', 'playing_position')]: { id: 'x', status: 'declined' as const, claimedValue: 'MF', createdAt: '' } },
    })

    expect(markup).toContain('name="position"')
  })

  it('warns that removing an accepted member needs confirming', () => {
    // The accepted member's control asks first; an unanswered invitation does not.
    const markup = html(CoachRosterActions, props)

    expect(markup).toContain('aria-label="นำน้องเอออกจากทีม ต้องยืนยันก่อน"')
    expect(markup).toContain('aria-label="นำน้องบีออกจากทีม"')
  })

  it('reports a failed attestation lookup instead of offering a stale form', () => {
    const markup = html(CoachRosterActions, { ...props, attestationError: true })

    expect(markup).toContain('โหลดสถานะคำรับรองไม่สำเร็จ')
    expect(markup).not.toContain('name="position"')
  })

  it('is not affected by the same athlete\u2019s attestation on another team', () => {
    // Regression: keyed by athlete alone, an accepted attestation on team A blocked and
    // mislabelled the form for the same athlete on team B.
    const markup = html(CoachRosterActions, {
      ...props,
      attestations: {
        [attestationKey('team-OTHER', 'a1', 'playing_position')]: { id: 'x', status: 'accepted' as const, claimedValue: 'GK', createdAt: '' },
      },
    })

    expect(markup).toContain('name="position"')
    expect(markup).not.toContain('รับรองแล้ว')
  })

  it('offers nothing once the roster is locked', () => {
    const markup = html(CoachRosterActions, { ...props, canManageRoster: false })

    expect(markup).not.toContain('<button')
    expect(markup).toContain('ส่งรายชื่อแล้ว')
  })
})

describe('AthleteAttestationInbox rendering', () => {
  const pending = [{
    id: 'att-1', teamName: 'ทีมลุงหมี',
    field: 'playing_position' as const, claimedValue: 'GK' as const,
    status: 'pending' as const, createdAt: '2026-09-10T00:00:00Z',
  }]

  it('identifies the coach by their team and never by personal data', () => {
    const markup = html(AthleteAttestationInbox, { attestations: pending })

    expect(markup).toContain('โค้ชของทีม ทีมลุงหมี')
    for (const leak of ['@', 'example.invalid', 'uuid', 'full_name']) {
      expect(markup, `${leak} must not reach the athlete`).not.toContain(leak)
    }
  })

  it('shows the athlete exactly which field and value a coach asked to confirm', () => {
    const markup = html(AthleteAttestationInbox, { attestations: pending })

    expect(markup).toContain(COACH_VERIFIED_FIELD_LABEL)
    expect(markup).toContain(POSITION_LABELS.GK)
    expect(markup).toContain('ทีมลุงหมี')
  })

  it('gives accept and decline accessible names', () => {
    const markup = html(AthleteAttestationInbox, { attestations: pending })

    expect(markup).toContain('aria-label="ยอมรับการรับรองตำแหน่งการเล่นจากทีมลุงหมี"')
    expect(markup).toContain('aria-label="ปฏิเสธการรับรองตำแหน่งการเล่นจากทีมลุงหมี"')
  })

  it('shows accepted and declined states without action buttons', () => {
    const accepted = html(AthleteAttestationInbox, { attestations: [{ ...pending[0], status: 'accepted' as const }] })
    const declined = html(AthleteAttestationInbox, { attestations: [{ ...pending[0], status: 'declined' as const }] })

    expect(accepted).toContain('ยอมรับแล้ว')
    expect(accepted).not.toContain('aria-label="ยอมรับ')
    expect(declined).toContain('ปฏิเสธแล้ว')
  })

  it('never says the athlete’s profile or ability was coach-verified', () => {
    const markup = html(AthleteAttestationInbox, { attestations: [{ ...pending[0], status: 'accepted' as const }] })

    expect(markup).toContain('ตำแหน่งการเล่น')
    for (const overclaim of ['โปรไฟล์ได้รับการรับรอง', 'ยืนยันตัวตน', 'รับรองความสามารถ', 'รับรองผลงาน']) {
      expect(markup).not.toContain(overclaim)
    }
  })

  it('says nothing at all when the athlete has no attestations', () => {
    expect(html(AthleteAttestationInbox, { attestations: [] })).toBe('')
  })
})
