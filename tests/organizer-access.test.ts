import { describe, expect, it } from 'vitest'
import {
  APPLICANT_DRAFT_LIMIT,
  REQUEST_COOLDOWN_DAYS,
  createStatusFor,
  normalisePhone,
  organizerAccessState,
  organizerRequestIssue,
  organizerRpcError,
} from '@/lib/organizer-access'

const valid = { orgName: 'สโมสรฟุตบอลเยาวชนเชียงใหม่', orgType: 'club', province: 'เชียงใหม่', phone: '081-234-5678', note: '' }
const now = new Date('2026-10-27T03:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

describe('the organizer request form (ADR-013)', () => {
  it('keeps digits and a leading plus of the phone', () => {
    expect(normalisePhone(' 081-234 5678 ')).toBe('0812345678')
    expect(normalisePhone('+66 81 234 5678')).toBe('+66812345678')
  })

  it('accepts the five fields the ADR names', () => {
    expect(organizerRequestIssue(valid)).toBeNull()
  })

  it('names the first field that is wrong, as the database would refuse it', () => {
    expect(organizerRequestIssue({ ...valid, orgName: ' x ' })).toBe('orgName')
    expect(organizerRequestIssue({ ...valid, orgType: 'gang' })).toBe('orgType')
    expect(organizerRequestIssue({ ...valid, province: 'Atlantis' })).toBe('province')
    expect(organizerRequestIssue({ ...valid, phone: '12' })).toBe('phone')
    expect(organizerRequestIssue({ ...valid, note: 'ก'.repeat(501) })).toBe('note')
  })

  it('takes only one of the 77 provinces', () => {
    expect(organizerRequestIssue({ ...valid, province: 'กรุงเทพมหานคร' })).toBeNull()
  })
})

describe('what an account sees about organizer access', () => {
  it('an organizer or admin needs no request', () => {
    expect(organizerAccessState({ role: 'organizer', requests: [], lastRevocationAt: null, now }).kind).toBe('organizer')
    expect(organizerAccessState({ role: 'admin', requests: [], lastRevocationAt: null, now }).kind).toBe('organizer')
  })

  it('a pending request lets the applicant make drafts', () => {
    const state = organizerAccessState({ role: 'user', requests: [{ id: 'r1', status: 'pending', created_at: daysAgo(1), decided_at: null, decision_reason: null }], lastRevocationAt: null, now })
    expect(state).toMatchObject({ kind: 'pending', requestId: 'r1' })
    expect(APPLICANT_DRAFT_LIMIT).toBe(3)
  })

  it('waits 7 days after a decline, then may ask again', () => {
    expect(REQUEST_COOLDOWN_DAYS).toBe(7)
    const declined = { id: 'r1', status: 'declined', created_at: daysAgo(3), decided_at: daysAgo(2), decision_reason: 'ข้อมูลไม่พอ' }
    const soon = organizerAccessState({ role: 'user', requests: [declined], lastRevocationAt: null, now })
    expect(soon).toMatchObject({ kind: 'cooldown', reason: 'ข้อมูลไม่พอ' })
    expect(soon.kind === 'cooldown' && soon.until.toISOString()).toBe(new Date(now.getTime() + 5 * 86_400_000).toISOString())
    const later = organizerAccessState({ role: 'user', requests: [{ ...declined, decided_at: daysAgo(8) }], lastRevocationAt: null, now })
    expect(later).toMatchObject({ kind: 'can_request', lastReason: 'ข้อมูลไม่พอ' })
  })

  it('waits 7 days after a revocation too', () => {
    const state = organizerAccessState({ role: 'user', requests: [{ id: 'r1', status: 'revoked', created_at: daysAgo(30), decided_at: daysAgo(29), decision_reason: 'ข้อมูลไม่ตรง' }], lastRevocationAt: daysAgo(1), now })
    expect(state.kind).toBe('cooldown')
  })

  it('anyone else may ask', () => {
    expect(organizerAccessState({ role: 'user', requests: [], lastRevocationAt: null, now }).kind).toBe('can_request')
    expect(organizerAccessState({ role: null, requests: [], lastRevocationAt: null, now }).kind).toBe('can_request')
  })
})

describe('a new tournament', () => {
  it('opens for an organizer and stays a draft for an applicant', () => {
    expect(createStatusFor('organizer', false)).toBe('open')
    expect(createStatusFor('admin', true)).toBe('draft')
    expect(createStatusFor('user', false)).toBe('draft')
  })
})

describe('database refusals become words', () => {
  it('maps every SQL89 refusal to an apiErrors code', () => {
    const cases: Array<[string, string, string]> = [
      ['P0001', 'REQUEST_PENDING', 'organizerRequestPending'],
      ['P0001', 'REQUEST_TOO_SOON', 'organizerRequestTooSoon'],
      ['P0001', 'ALREADY_ORGANIZER', 'alreadyOrganizer'],
      ['P0001', 'ALREADY_DECIDED', 'organizerRequestDecided'],
      ['P0001', 'NOT_ORGANIZER', 'notOrganizerAccount'],
      ['P0001', 'DRAFT_LIMIT', 'draftLimit'],
      ['42501', 'ORGANIZER_REQUEST_REQUIRED', 'organizerRequestRequired'],
      ['42501', 'ORGANIZER_REQUIRED', 'organizerRequired'],
      ['P0001', 'CANNOT_RETURN_TO_DRAFT', 'cannotReturnToDraft'],
      ['22023', 'REASON_REQUIRED', 'reasonRequired'],
      ['22023', 'INVALID_REQUEST', 'requestInvalid'],
      ['P0002', 'REQUEST_NOT_FOUND', 'organizerRequestNotFound'],
      ['42501', 'FORBIDDEN', 'notAllowed'],
      ['PGRST202', 'Could not find the function', 'featureNotReady'],
      ['42883', 'function does not exist', 'featureNotReady'],
    ]
    for (const [code, message, expected] of cases) {
      expect(organizerRpcError({ code, message })?.code).toBe(expected)
    }
  })

  it('leaves an unknown error to the caller', () => {
    expect(organizerRpcError({ code: 'XX000', message: 'boom' })).toBeNull()
  })
})
