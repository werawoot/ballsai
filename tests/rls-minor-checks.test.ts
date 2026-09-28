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

  it('checks that a child\'s birth date and consent record are not readable signed out, even on a public profile', () => {
    const exposure = all().filter(check => check.audience === 'anonymous' && /birth_date|guardian_consent_at/.test(check.path))
    expect(exposure.map(check => check.path)).toEqual(expect.arrayContaining([
      '/athlete_profiles?select=user_id,birth_date&is_public=eq.true&birth_date=not.is.null&limit=1',
      '/athlete_profiles?select=user_id,guardian_consent_at&is_public=eq.true&guardian_consent_at=not.is.null&limit=1',
    ]))
    for (const check of exposure) expect(check.expected).toBe('hidden')
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
      if (check.method === 'POST') expect(check.path).toMatch(/^\/rpc\/public_/)
    }
    const labels = all({ PRIVATE_PROFILE_USER_ID: 'p', GUARDIAN_LINK_ID: 'g' }).map(check => check.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
