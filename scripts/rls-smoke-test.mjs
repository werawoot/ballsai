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
    body = text
  }

  return { status: response.status, body }
}

function expectBlocked(label, result) {
  const blocked =
    result.status === 401 ||
    result.status === 403 ||
    result.status === 404 ||
    (result.status === 200 && Array.isArray(result.body) && result.body.length === 0)
  console.log(`${blocked ? 'PASS' : 'FAIL'} ${label}: HTTP ${result.status}`)
  if (!blocked) {
    console.log(result.body)
    process.exitCode = 1
  }
}

function expectAllowed(label, result) {
  const allowed =
    result.status >= 200 &&
    result.status < 300 &&
    (!Array.isArray(result.body) || result.body.length > 0)
  console.log(`${allowed ? 'PASS' : 'FAIL'} ${label}: HTTP ${result.status}`)
  if (!allowed) {
    console.log(result.body)
    process.exitCode = 1
  }
}

const playerJwt = process.env.PLAYER_JWT
const organizerJwt = process.env.ORGANIZER_JWT
const adminJwt = process.env.ADMIN_JWT

const playerBProfileId = process.env.PLAYER_B_PROFILE_ID
const playerRankId = process.env.PLAYER_RANK_ID
const foreignTournamentId = process.env.FOREIGN_TOURNAMENT_ID
const ownedTournamentId = process.env.OWNED_TOURNAMENT_ID

if (playerBProfileId) {
  expectBlocked(
    'player cannot update another profile',
    await requestAs(playerJwt, `/profiles?id=eq.${playerBProfileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'blocked-by-rls-test' }),
    })
  )
} else {
  console.log('SKIP player cannot update another profile: set PLAYER_B_PROFILE_ID')
}

if (playerRankId) {
  expectBlocked(
    'player cannot update player_ranks',
    await requestAs(playerJwt, `/player_ranks?id=eq.${playerRankId}`, {
      method: 'PATCH',
      body: JSON.stringify({ pts: 999 }),
    })
  )

  expectAllowed(
    'admin can update player_ranks',
    await requestAs(adminJwt, `/player_ranks?id=eq.${playerRankId}`, {
      method: 'PATCH',
      body: JSON.stringify({ rank_change: 0 }),
    })
  )
} else {
  console.log('SKIP ranking write checks: set PLAYER_RANK_ID')
}

if (foreignTournamentId) {
  expectBlocked(
    'organizer cannot update another organizer tournament',
    await requestAs(organizerJwt, `/tournaments?id=eq.${foreignTournamentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed' }),
    })
  )
} else {
  console.log('SKIP foreign organizer tournament check: set FOREIGN_TOURNAMENT_ID')
}

if (ownedTournamentId) {
  expectAllowed(
    'organizer can update owned tournament',
    await requestAs(organizerJwt, `/tournaments?id=eq.${ownedTournamentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'open' }),
    })
  )
} else {
  console.log('SKIP owned organizer tournament check: set OWNED_TOURNAMENT_ID')
}
