/**
 * Closed-beta RLS smoke tests.
 *
 * Required environment variables:
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * PLAYER_JWT, ORGANIZER_JWT, ADMIN_JWT
 *
 * Optional target IDs:
 * PLAYER_B_PROFILE_ID, PLAYER_RANK_ID, FOREIGN_TOURNAMENT_ID,
 * OWNED_TOURNAMENT_ID, PLAYER_B_TEAM_ID, OWNED_TEAM_ID
 *
 * This script defaults to safe checks. It never performs a write that is
 * expected to succeed unless ALLOW_RLS_WRITE_TESTS=true is explicitly set.
 */

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'PLAYER_JWT',
  'ORGANIZER_JWT',
  'ADMIN_JWT',
]

const missing = required.filter(name => !process.env[name])
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(', ')}`)
  console.error('See docs/closed-beta-runbook.md for setup.')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const allowWriteTests = process.env.ALLOW_RLS_WRITE_TESTS === 'true'

async function requestAs(jwt, path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  })

  const text = await response.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Keep non-JSON error responses as plain text.
  }
  return { status: response.status, body }
}

function report(label, passed, result) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: HTTP ${result.status}`)
  if (!passed) {
    console.log(result.body)
    process.exitCode = 1
  }
}

function expectBlocked(label, result) {
  const blocked =
    result.status === 401 ||
    result.status === 403 ||
    result.status === 404 ||
    (result.status === 200 && Array.isArray(result.body) && result.body.length === 0)
  report(label, blocked, result)
}

function expectAllowed(label, result) {
  report(label, result.status >= 200 && result.status < 300, result)
}

async function expectReadAccess(label, jwt, path) {
  expectAllowed(label, await requestAs(jwt, path))
}

async function runWriteTest(label, jwt, path, body, expected) {
  if (!allowWriteTests) {
    console.log(`SKIP ${label}: set ALLOW_RLS_WRITE_TESTS=true to permit this write test`)
    return
  }
  expected(label, await requestAs(jwt, path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
}

const playerJwt = process.env.PLAYER_JWT
const organizerJwt = process.env.ORGANIZER_JWT
const adminJwt = process.env.ADMIN_JWT
const playerBProfileId = process.env.PLAYER_B_PROFILE_ID
const playerRankId = process.env.PLAYER_RANK_ID
const foreignTournamentId = process.env.FOREIGN_TOURNAMENT_ID
const ownedTournamentId = process.env.OWNED_TOURNAMENT_ID
const playerBTeamId = process.env.PLAYER_B_TEAM_ID
const ownedTeamId = process.env.OWNED_TEAM_ID

await expectReadAccess('player can read public ranking', playerJwt, '/player_ranks?select=id&limit=1')
await expectReadAccess('organizer can read public tournaments', organizerJwt, '/tournaments?select=id&limit=1')

if (playerBProfileId) {
  expectBlocked('player cannot read another private profile', await requestAs(playerJwt, `/profiles?id=eq.${playerBProfileId}&select=id`))
  await runWriteTest('player cannot update another profile', playerJwt, `/profiles?id=eq.${playerBProfileId}`, { full_name: 'rls-write-test-blocked' }, expectBlocked)
} else console.log('SKIP player profile checks: set PLAYER_B_PROFILE_ID')

if (playerRankId) {
  await runWriteTest('player cannot update player ranking', playerJwt, `/player_ranks?id=eq.${playerRankId}`, { rank_change: 999 }, expectBlocked)
  await runWriteTest('admin can update player ranking', adminJwt, `/player_ranks?id=eq.${playerRankId}`, { rank_change: 0 }, expectAllowed)
} else console.log('SKIP ranking write checks: set PLAYER_RANK_ID')

if (foreignTournamentId) {
  await runWriteTest('organizer cannot update another organizer tournament', organizerJwt, `/tournaments?id=eq.${foreignTournamentId}`, { status: 'closed' }, expectBlocked)
} else console.log('SKIP foreign organizer tournament check: set FOREIGN_TOURNAMENT_ID')

if (ownedTournamentId) {
  await runWriteTest('organizer can update owned tournament', organizerJwt, `/tournaments?id=eq.${ownedTournamentId}`, { status: 'open' }, expectAllowed)
} else console.log('SKIP owned organizer tournament check: set OWNED_TOURNAMENT_ID')

if (playerBTeamId) {
  await runWriteTest('player cannot update another user team', playerJwt, `/teams?id=eq.${playerBTeamId}`, { status: 'confirmed' }, expectBlocked)
} else console.log('SKIP foreign team check: set PLAYER_B_TEAM_ID')

if (ownedTeamId) {
  await expectReadAccess('organizer can read owned tournament team', organizerJwt, `/teams?id=eq.${ownedTeamId}&select=id`)
} else console.log('SKIP owned team read check: set OWNED_TEAM_ID')

if (!allowWriteTests) console.log('Safe mode complete. Run ALLOW_RLS_WRITE_TESTS=true only in an isolated test tournament.')
