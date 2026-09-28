/**
 * Read-only RLS checks for minors' and other private data (T21).
 *
 * Run by scripts/rls-smoke-test.mjs against Staging with real sign-ins. Every check reads;
 * none writes. Checks that need a test record run only when its id is supplied, so a
 * missing id is reported as skipped, never as passed. Ids come from a disposable test
 * setup at run time: no credentials or production identifiers live in the repository.
 *
 * Audiences: anonymous (no sign-in), owner (the athlete), guardian (that athlete's
 * accepted guardian), unrelated (a signed-in user with no link to any of it).
 * Expected: visible (rows come back), hidden (200 with no rows), blocked (hidden, or
 * refused with 401/403).
 */

// Tables no signed-out visitor may read a single row of. A table missing from the
// database under test is reported as skipped by the runner, not as passed.
export const SIGNED_OUT_CLOSED_TABLES = [
  'profiles',
  'guardian_links',
  'team_members',
  'teams',
  'payments',
  'notifications',
  'coach_attestations',
  'coach_verified_fields',
  'account_deletion_requests',
  'organizations',
  'organization_members',
  'organization_teams',
  'match_plans',
  'tournament_fixtures',
  'venue_booking_requests',
  'venue_booking_coordination',
  'data_disputes',
  'scout_shortlists',
]

export function buildMinorDataChecks(ids) {
  const checks = []
  const add = (needs, check) => {
    if (needs.every(name => ids[name])) checks.push({ ...check, needs })
  }

  for (const table of SIGNED_OUT_CLOSED_TABLES) {
    add([], { label: `signed out cannot read any ${table} row`, audience: 'anonymous', expected: 'blocked', path: `/${table}?select=*&limit=1` })
  }

  // A public profile shows an athlete's age, never the date itself or the consent record.
  // Row-level security alone opens every column of a public row; sql/58 withholds these two
  // columns, so the API refuses the read (401 signed out, 403 signed in). The first check
  // makes sure there is a public profile to test against: without one the rest pass empty.
  add([], {
    label: 'signed out can read a public profile\'s name (so the birth date checks are not empty passes)',
    audience: 'anonymous', expected: 'visible',
    path: '/athlete_profiles?select=user_id,display_name&is_public=eq.true&limit=1',
  })
  for (const [audience, who] of [['anonymous', 'signed out'], ['unrelated', 'unrelated user']]) {
    add([], {
      label: `${who} cannot read a birth date, even of a public profile`,
      audience, expected: 'blocked',
      path: '/athlete_profiles?select=user_id,birth_date&is_public=eq.true&birth_date=not.is.null&limit=1',
    })
    add([], {
      label: `${who} cannot read a guardian consent record, even of a public profile`,
      audience, expected: 'blocked',
      path: '/athlete_profiles?select=user_id,guardian_consent_at&is_public=eq.true&guardian_consent_at=not.is.null&limit=1',
    })
  }
  add([], {
    label: 'signed out cannot call my_athlete_private',
    audience: 'anonymous', expected: 'blocked', method: 'POST', path: '/rpc/my_athlete_private', body: {},
  })

  const profile = ids.PRIVATE_PROFILE_USER_ID
  add(['PRIVATE_PROFILE_USER_ID'], { label: 'athlete can read own private profile', audience: 'owner', expected: 'visible', path: `/athlete_profiles?user_id=eq.${profile}&select=user_id` })
  add(['PRIVATE_PROFILE_USER_ID'], { label: 'unrelated user cannot read a private profile', audience: 'unrelated', expected: 'hidden', path: `/athlete_profiles?user_id=eq.${profile}&select=user_id` })
  add(['PRIVATE_PROFILE_USER_ID'], { label: 'signed out cannot read a private profile', audience: 'anonymous', expected: 'hidden', path: `/athlete_profiles?user_id=eq.${profile}&select=user_id` })
  add(['PRIVATE_PROFILE_USER_ID'], { label: 'athlete reads own birth date through my_athlete_private', audience: 'owner', expected: 'visible', method: 'POST', path: '/rpc/my_athlete_private', body: {} })

  const link = ids.GUARDIAN_LINK_ID
  add(['GUARDIAN_LINK_ID'], { label: 'guardian can read own guardian link', audience: 'guardian', expected: 'visible', path: `/guardian_links?id=eq.${link}&select=id` })
  add(['GUARDIAN_LINK_ID'], { label: 'unrelated user cannot read a guardian link', audience: 'unrelated', expected: 'hidden', path: `/guardian_links?id=eq.${link}&select=id` })

  add(['FOREIGN_TEAM_ID'], { label: 'unrelated user cannot read another team\'s members', audience: 'unrelated', expected: 'hidden', path: `/team_members?team_id=eq.${ids.FOREIGN_TEAM_ID}&select=athlete_id` })
  add(['FOREIGN_PAYMENT_ID'], { label: 'unrelated user cannot read another team\'s payment', audience: 'unrelated', expected: 'hidden', path: `/payments?id=eq.${ids.FOREIGN_PAYMENT_ID}&select=id,slip_url` })

  const draw = ids.UNPUBLISHED_FIXTURE_TOURNAMENT_ID
  add(['UNPUBLISHED_FIXTURE_TOURNAMENT_ID'], { label: 'unrelated user cannot read another organizer\'s draw', audience: 'unrelated', expected: 'hidden', path: `/tournament_fixtures?tournament_id=eq.${draw}&select=fixture_key` })
  add(['UNPUBLISHED_FIXTURE_TOURNAMENT_ID'], { label: 'signed out gets nothing from an unpublished draw', audience: 'anonymous', expected: 'hidden', method: 'POST', path: '/rpc/public_tournament_fixtures', body: { p_tournament_id: draw } })

  add(['FOREIGN_ORGANIZATION_ID'], { label: 'unrelated user cannot read another organization\'s members', audience: 'unrelated', expected: 'hidden', path: `/organization_members?organization_id=eq.${ids.FOREIGN_ORGANIZATION_ID}&select=user_id` })

  return checks
}
