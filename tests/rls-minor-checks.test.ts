import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs module shared with the Node script
import { SIGNED_OUT_CLOSED_TABLES, buildMinorDataChecks } from '../scripts/rls-minor-checks.mjs'

type Check = { label: string; audience: string; expected: string; path: string; method?: string; body?: unknown; needs: string[] }
const all = (ids: Record<string, string> = {}) => buildMinorDataChecks(ids) as Check[]

// T21: the database, not the app, must keep minors' data from people who should not see
// it. These checks run against Staging with real sign-ins (scripts/rls-smoke-test.mjs);
// this test keeps the list itself honest.
describe('RLS checks for minors\' data', () => {
  it('sweeps every table that holds minors\' or private data, signed out, without any ids', () => {
    for (const table of ['guardian_links', 'team_members', 'teams', 'payments', 'notifications', 'profiles', 'coach_attestations',
      'coach_verified_fields', 'account_deletion_requests', 'organization_members', 'match_plans', 'tournament_fixtures', 'venue_booking_requests']) {
      expect(SIGNED_OUT_CLOSED_TABLES).toContain(table)
    }
    const sweep = all().filter(check => check.audience === 'anonymous' && check.needs.length === 0)
    for (const table of SIGNED_OUT_CLOSED_TABLES) {
      expect(sweep.find(check => check.path.startsWith(`/${table}?`))).toMatchObject({ expected: 'blocked' })
    }
  })

  // T50 / sql/58: the two columns are refused outright, signed out and signed in alike.
  it.each(['anonymous', 'unrelated'])('checks that a child\'s birth date and consent record are refused to %s, even on a public profile', audience => {
    const exposure = all().filter(check => check.audience === audience && /birth_date|guardian_consent_at/.test(check.path))
    expect(exposure.map(check => check.path)).toEqual([
      '/athlete_profiles?select=user_id,birth_date&is_public=eq.true&birth_date=not.is.null&limit=1',
      '/athlete_profiles?select=user_id,guardian_consent_at&is_public=eq.true&guardian_consent_at=not.is.null&limit=1',
    ])
    for (const check of exposure) expect(check.expected).toBe('blocked')
  })

  it('makes sure a public profile exists, so the birth date checks cannot pass on an empty database', () => {
    expect(all().find(check => check.path === '/athlete_profiles?select=user_id,display_name&is_public=eq.true&limit=1')).toMatchObject({ audience: 'anonymous', expected: 'visible' })
  })

  it('lets only the athlete read their own birth date, through my_athlete_private', () => {
    const calls = all({ PRIVATE_PROFILE_USER_ID: 'p' }).filter(check => check.path === '/rpc/my_athlete_private')
    expect(calls.map(check => [check.audience, check.expected])).toEqual([['anonymous', 'blocked'], ['owner', 'visible']])
  })

  it('checks each person against someone else\'s records when test ids are given', () => {
    const ids = { PRIVATE_PROFILE_USER_ID: 'p', GUARDIAN_LINK_ID: 'g', FOREIGN_TEAM_ID: 't', FOREIGN_PAYMENT_ID: 'pay', UNPUBLISHED_FIXTURE_TOURNAMENT_ID: 'f', FOREIGN_ORGANIZATION_ID: 'o' }
    const checks = all(ids)
    const find = (audience: string, fragment: string) => checks.find(check => check.audience === audience && check.path.includes(fragment))
    expect(find('owner', 'user_id=eq.p')).toMatchObject({ expected: 'visible' })
    expect(find('unrelated', 'user_id=eq.p')).toMatchObject({ expected: 'hidden' })
    expect(find('anonymous', 'user_id=eq.p')).toMatchObject({ expected: 'hidden' })
    expect(find('guardian', 'guardian_links?id=eq.g')).toMatchObject({ expected: 'visible' })
    expect(find('unrelated', 'guardian_links?id=eq.g')).toMatchObject({ expected: 'hidden' })
    expect(find('unrelated', 'team_members?team_id=eq.t')).toMatchObject({ expected: 'hidden' })
    expect(find('unrelated', 'payments?id=eq.pay')).toMatchObject({ expected: 'hidden' })
    expect(find('unrelated', 'tournament_fixtures?tournament_id=eq.f')).toMatchObject({ expected: 'hidden' })
    expect(find('anonymous', '/rpc/public_tournament_fixtures')).toMatchObject({ expected: 'hidden', method: 'POST', body: { p_tournament_id: 'f' } })
    expect(find('unrelated', 'organization_members?organization_id=eq.o')).toMatchObject({ expected: 'hidden' })
  })

  it('skips a check whose ids are missing instead of passing it', () => {
    const withIds = all({ PRIVATE_PROFILE_USER_ID: 'p' })
    expect(withIds.every(check => check.needs.every(name => name === 'PRIVATE_PROFILE_USER_ID'))).toBe(true)
    expect(all().every(check => check.needs.length === 0)).toBe(true)
  })

  it('only ever reads: no check writes anything', () => {
    for (const check of all({ PRIVATE_PROFILE_USER_ID: 'p', GUARDIAN_LINK_ID: 'g', FOREIGN_TEAM_ID: 't', FOREIGN_PAYMENT_ID: 'pay', UNPUBLISHED_FIXTURE_TOURNAMENT_ID: 'f', FOREIGN_ORGANIZATION_ID: 'o' })) {
      expect(check.method ?? 'GET').toMatch(/^(GET|POST)$/)
      // Only functions that read: the public readers and the athlete's own private fields.
      if (check.method === 'POST') expect(check.path).toMatch(/^\/rpc\/(public_|my_athlete_private$)/)
    }
    const labels = all({ PRIVATE_PROFILE_USER_ID: 'p', GUARDIAN_LINK_ID: 'g' }).map(check => check.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
