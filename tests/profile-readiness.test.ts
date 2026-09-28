import { describe, expect, it } from 'vitest'
import { profileReadiness } from '@/lib/profile-readiness'

const today = '2026-09-28'
const complete = {
  displayName: 'Somchai', birthDate: '1999-01-01', photo: 'https://x/y.jpg', position: 'MF', team: 'Chiang Mai FC',
  guardianConsentAt: null, mediaCount: 1, isPublic: true, pendingGuardianRequests: 0,
}

// The /profile checklist: what an athlete still has to do before their profile can go
// public, in the order that unblocks it. It must mirror the rules the database enforces
// (sql/21, guardian-consent-enforcement): a birth date, and a guardian for anyone under 20.
describe('profile readiness', () => {
  it('has nothing left for a complete adult profile', () => {
    const readiness = profileReadiness(complete, today)
    expect(readiness.items.map(item => item.key)).toEqual(['basics', 'photo', 'playing', 'highlight', 'public'])
    expect(readiness.items.every(item => item.done)).toBe(true)
    expect(readiness.next).toBeNull()
    expect(readiness).toMatchObject({ done: 5, total: 5, isMinor: false, canPublish: true })
  })

  it('asks a minor for a guardian before the profile can go public', () => {
    const readiness = profileReadiness({ ...complete, birthDate: '2012-03-04', isPublic: false }, today)
    expect(readiness.isMinor).toBe(true)
    expect(readiness.items.map(item => item.key)).toEqual(['basics', 'photo', 'playing', 'guardian', 'highlight', 'public'])
    expect(readiness.items.find(item => item.key === 'guardian')).toMatchObject({ done: false, href: '/guardian' })
    expect(readiness.items.find(item => item.key === 'public')).toMatchObject({ done: false, blocked: true })
    expect(readiness.next?.key).toBe('guardian')
    expect(readiness.canPublish).toBe(false)
  })

  it('counts 19 as a minor and 20 as an adult, on the Thai date', () => {
    expect(profileReadiness({ ...complete, birthDate: '2006-09-29' }, today).isMinor).toBe(true)
    expect(profileReadiness({ ...complete, birthDate: '2006-09-28' }, today).isMinor).toBe(false)
  })

  it('lets a minor with recorded consent publish', () => {
    const readiness = profileReadiness({ ...complete, birthDate: '2012-03-04', guardianConsentAt: '2026-01-01T00:00:00Z' }, today)
    expect(readiness.items.find(item => item.key === 'guardian')?.done).toBe(true)
    expect(readiness.canPublish).toBe(true)
  })

  it('tells a minor when a guardian request is waiting for them', () => {
    const readiness = profileReadiness({ ...complete, birthDate: '2012-03-04', pendingGuardianRequests: 2 }, today)
    expect(readiness.items.find(item => item.key === 'guardian')).toMatchObject({ pending: 2 })
  })

  it('blocks publishing without a birth date and starts with the basics', () => {
    const readiness = profileReadiness({ ...complete, birthDate: null, isPublic: false, photo: null, mediaCount: 0 }, today)
    expect(readiness.items.find(item => item.key === 'public')).toMatchObject({ done: false, blocked: true })
    expect(readiness.next?.key).toBe('basics')
    expect(readiness.isMinor).toBe(false)
    expect(readiness.done).toBe(1)
  })

  it('points every open step at the place that completes it', () => {
    const readiness = profileReadiness({ ...complete, birthDate: '2012-03-04', photo: null, position: null, mediaCount: 0, isPublic: false, displayName: '' }, today)
    expect(Object.fromEntries(readiness.items.map(item => [item.key, item.href]))).toEqual({
      basics: '/profile/edit#details', photo: '/profile/edit#details', playing: '/profile/edit#details',
      guardian: '/guardian', highlight: '/profile/edit#highlights', public: '/profile/edit#privacy',
    })
  })
})
