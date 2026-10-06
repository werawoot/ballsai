import { describe, expect, it } from 'vitest'
import { approvalAction } from '@/lib/team-approval'

// One approval button per pending team. confirm_payment_safely (production-hardening.sql)
// confirms the payment AND the team in one transaction, so a team with a payment waiting
// for review needs one tap. A separate "confirm the team" exists only where there is no
// payment to review: a tournament with no fee, or a payment already confirmed.
describe('approvalAction', () => {
  it('confirms payment and team together when a slip is waiting for review', () => {
    expect(approvalAction(1500, { status: 'pending' })).toBe('confirmPayment')
    expect(approvalAction(0, { status: 'pending' })).toBe('confirmPayment')
    expect(approvalAction(null, { status: 'pending' })).toBe('confirmPayment')
  })

  it('confirms only the team when the payment is already confirmed', () => {
    expect(approvalAction(1500, { status: 'confirmed' })).toBe('confirmTeam')
  })

  it('confirms the team of a tournament with no fee', () => {
    expect(approvalAction(0, null)).toBe('confirmTeam')
  })

  it('waits for the slip of a paid tournament that has none yet', () => {
    expect(approvalAction(1500, null)).toBe('waitSlip')
  })

  it('keeps the old behaviour when the fee is not known', () => {
    expect(approvalAction(undefined, null)).toBe('confirmTeam')
    expect(approvalAction(null, null)).toBe('confirmTeam')
  })

  it('does not treat a rejected or unknown payment as one to confirm', () => {
    expect(approvalAction(1500, { status: 'rejected' })).toBe('waitSlip')
    expect(approvalAction(0, { status: 'rejected' })).toBe('confirmTeam')
  })
})
