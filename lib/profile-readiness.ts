import { ageOn } from '@/lib/athlete-private'

// What an athlete still has to do before their profile can go public, in the order that
// unblocks it. The publishing rules mirror the database (sql/21 and
// guardian-consent-enforcement): a birth date always, and a guardian's recorded consent
// for anyone under 20. The database stays the authority; this only explains it.

export const MINOR_UNDER = 20

export type ReadinessKey = 'basics' | 'photo' | 'playing' | 'guardian' | 'highlight' | 'public'
export type ReadinessItem = { key: ReadinessKey; done: boolean; href: string; blocked?: boolean; pending?: number }
export type ReadinessInput = {
  displayName?: string | null
  birthDate?: string | null
  photo?: string | null
  position?: string | null
  team?: string | null
  guardianConsentAt?: string | null
  mediaCount: number
  isPublic: boolean
  pendingGuardianRequests: number
}

export function profileReadiness(input: ReadinessInput, today: string) {
  const age = input.birthDate ? ageOn(input.birthDate, today) : null
  const isMinor = age !== null && age < MINOR_UNDER
  const basics = Boolean(input.displayName?.trim() && input.birthDate)
  const guardian = !isMinor || Boolean(input.guardianConsentAt)
  const canPublish = basics && guardian

  const items: ReadinessItem[] = [
    { key: 'basics', done: basics, href: '/profile/edit#details' },
    { key: 'photo', done: Boolean(input.photo), href: '/profile/edit#details' },
    { key: 'playing', done: Boolean(input.position && input.team?.trim()), href: '/profile/edit#details' },
    ...(isMinor ? [{ key: 'guardian' as const, done: guardian, href: '/guardian', pending: input.pendingGuardianRequests }] : []),
    { key: 'highlight', done: input.mediaCount > 0, href: '/profile/edit#highlights' },
    { key: 'public', done: input.isPublic, href: '/profile/edit#privacy', blocked: !input.isPublic && !canPublish },
  ]
  const next = items.find(item => !item.done && !item.blocked) ?? null
  return { items, next, done: items.filter(item => item.done).length, total: items.length, isMinor, age, canPublish }
}
