import { describe, expect, it } from 'vitest'
import {
  attestationGate,
  attestationKey,
  coachTeamLabel,
  latestAttestations,
  removeNeedsConfirmation,
  type AttestationRow,
} from '@/lib/coach-team-overview'

const row = (over: Partial<AttestationRow> & { id: string }): AttestationRow => ({
  team_id: 'team-1', athlete_id: 'a1', field: 'playing_position', claimed_value: 'GK',
  status: 'pending', created_at: '2026-09-01T00:00:00Z', ...over,
})

describe('coachTeamLabel', () => {
  it('names the coach by their team, never by personal data', () => {
    const label = coachTeamLabel('ทีมลุงหมี')

    expect(label).toBe('โค้ชของทีม ทีมลุงหมี')
    // No account identity may leak into the label.
    for (const leak of ['@', 'email', 'phone', 'uuid']) expect(label).not.toContain(leak)
  })

  it('reads as a label a person would accept', () => {
    expect(coachTeamLabel('BDS United')).toBe('โค้ชของทีม BDS United')
  })

  it('falls back without inventing a name when the team is unknown', () => {
    expect(coachTeamLabel('')).toBe('โค้ชของทีม')
    expect(coachTeamLabel(null)).toBe('โค้ชของทีม')
  })
})

describe('attestationKey', () => {
  it('keys on team, athlete and field together', () => {
    expect(attestationKey('team-1', 'a1', 'playing_position')).toBe('team-1|a1|playing_position')
  })

  it('distinguishes the same athlete on two different teams', () => {
    expect(attestationKey('team-A', 'a1', 'playing_position'))
      .not.toBe(attestationKey('team-B', 'a1', 'playing_position'))
  })
})

describe('latestAttestations', () => {
  it('keeps only the newest row per team, athlete and field', () => {
    const map = latestAttestations([
      row({ id: 'old', created_at: '2026-09-01T00:00:00Z', status: 'declined' }),
      row({ id: 'new', created_at: '2026-09-05T00:00:00Z', status: 'pending' }),
    ])

    expect(map[attestationKey('team-1', 'a1', 'playing_position')]?.id).toBe('new')
  })

  it('does not let one team\u2019s attestation affect the same athlete on another team', () => {
    // Regression: keying by athlete alone made an accepted attestation on team A block
    // and mislabel the form for the same athlete on team B.
    const map = latestAttestations([
      row({ id: 'a-team', team_id: 'team-A', status: 'accepted', claimed_value: 'GK' }),
    ])

    expect(map[attestationKey('team-A', 'a1', 'playing_position')]?.status).toBe('accepted')
    expect(map[attestationKey('team-B', 'a1', 'playing_position')]).toBeUndefined()
  })

  it('separates athletes', () => {
    const map = latestAttestations([
      row({ id: 'x', athlete_id: 'a1' }),
      row({ id: 'y', athlete_id: 'a2', claimed_value: 'FW' }),
    ])

    expect(map[attestationKey('team-1', 'a1', 'playing_position')]?.id).toBe('x')
    expect(map[attestationKey('team-1', 'a2', 'playing_position')]?.claimedValue).toBe('FW')
  })

  it('is empty when the query returned nothing', () => {
    expect(latestAttestations([])).toEqual({})
    expect(latestAttestations(null)).toEqual({})
  })

  it('exposes only the state the coach needs, not the raw row', () => {
    const map = latestAttestations([row({ id: 'x' })])

    expect(Object.keys(map[attestationKey('team-1', 'a1', 'playing_position')]!).sort())
      .toEqual(['claimedValue', 'createdAt', 'id', 'status'])
  })
})

describe('attestationGate', () => {
  it('allows a first attestation for an accepted member', () => {
    const gate = attestationGate('accepted', undefined)

    expect(gate.canSubmit).toBe(true)
    expect(gate.state).toBe('none')
  })

  it('never offers one for a member who has not accepted the invitation', () => {
    for (const status of ['pending', 'declined', 'removed'] as const) {
      expect(attestationGate(status, undefined).canSubmit, status).toBe(false)
    }
  })

  it('blocks a duplicate while one is still pending', () => {
    const gate = attestationGate('accepted', { id: 'x', status: 'pending', claimedValue: 'GK', createdAt: '' })

    expect(gate.canSubmit).toBe(false)
    expect(gate.state).toBe('pending')
    expect(gate.reason).toContain('รอนักกีฬาตอบ')
  })

  it('blocks a second attestation once one was accepted', () => {
    const gate = attestationGate('accepted', { id: 'x', status: 'accepted', claimedValue: 'DF', createdAt: '' })

    expect(gate.canSubmit).toBe(false)
    expect(gate.state).toBe('accepted')
    // No replacement flow is defined for closed beta, so say so rather than fail later.
    expect(gate.reason).toContain('รับรองแล้ว')
  })

  it('allows a new attestation after the athlete declined', () => {
    const gate = attestationGate('accepted', { id: 'x', status: 'declined', claimedValue: 'MF', createdAt: '' })

    expect(gate.canSubmit).toBe(true)
    expect(gate.state).toBe('declined')
  })
})

describe('removeNeedsConfirmation', () => {
  it('asks before removing a member who already accepted', () => {
    expect(removeNeedsConfirmation('accepted')).toBe(true)
  })

  it('does not interrupt removing an invitation nobody accepted', () => {
    expect(removeNeedsConfirmation('pending')).toBe(false)
    expect(removeNeedsConfirmation('declined')).toBe(false)
  })
})
