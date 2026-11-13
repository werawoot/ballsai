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
  'training_enrollments',
  'training_checkins',
  'athlete_training_goals',
  'athlete_self_tests',
]

// Each athlete's own training data (ADR-015; sql/63, 95, 96): only the athlete, an accepted
// guardian and an admin may read it, and nobody signed out.
export const TRAINING_TABLES = ['training_enrollments', 'training_checkins', 'athlete_training_goals', 'athlete_self_tests']

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

  // One test athlete (signed in as the owner) with at least one row in each training table and
  // an accepted guardian (GUARDIAN_JWT). The owner, guardian and admin checks expect rows, so an
  // empty table fails instead of letting the unrelated check pass on nothing.
  const athlete = ids.TRAINING_ATHLETE_ID
  for (const table of TRAINING_TABLES) {
    const path = `/${table}?athlete_id=eq.${athlete}&select=athlete_id&limit=1`
    add(['TRAINING_ATHLETE_ID'], { label: `athlete can read own ${table}`, audience: 'owner', expected: 'visible', path })
    add(['TRAINING_ATHLETE_ID'], { label: `accepted guardian can read their child's ${table}`, audience: 'guardian', expected: 'visible', path })
    add(['TRAINING_ATHLETE_ID'], { label: `admin can read an athlete's ${table}`, audience: 'admin', expected: 'visible', path })
    add(['TRAINING_ATHLETE_ID'], { label: `unrelated user cannot read another athlete's ${table}`, audience: 'unrelated', expected: 'hidden', path })
  }

  // Writing someone else's training data must be refused (401/403). Each attempt is shaped so a
  // broken rule still stores nothing where it can: the check-in names an enrollment that does
  // not exist (a foreign-key error, not a row), goals and self-tests have no table grant at all.
  // The enrollment insert is the one that would store a row if its policy were broken; it is
  // still refused today by the policy's athlete_id = auth.uid() (sql/63).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const missingEnrollment = '00000000-0000-4000-8000-000000000000'
  const foreignWrites = [
    ['training_enrollments', { athlete_id: athlete, program_id: 'u10-foundation-01', weekdays: [1], start_date: today }],
    ['training_checkins', { enrollment_id: missingEnrollment, athlete_id: athlete, session_date: today, drills_done: 1 }],
    ['athlete_training_goals', { athlete_id: athlete, goal_key: 'speed' }],
    ['athlete_self_tests', { athlete_id: athlete, test_key: 'plank', value: 30, test_date: today }],
  ]
  for (const [table, body] of foreignWrites) {
    for (const [audience, who] of [['unrelated', 'unrelated user'], ['guardian', 'guardian']]) {
      add(['TRAINING_ATHLETE_ID'], { label: `${who} cannot write ${table} for another athlete`, audience, expected: 'denied', method: 'POST', path: `/${table}`, body })
    }
  }
  // Goals and self-tests change only through their functions (sql/95, 96), even for the athlete.
  for (const [table, body] of foreignWrites.slice(2)) {
    add(['TRAINING_ATHLETE_ID'], { label: `athlete cannot write ${table} directly, only through its function`, audience: 'owner', expected: 'denied', method: 'POST', path: `/${table}`, body })
  }

  return checks
}
