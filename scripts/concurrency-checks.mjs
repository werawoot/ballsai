import { assertMayRun, judgeAtMostOne, judgeOneWinner, judgeSameAnswer, unchangedDrawPayload } from './concurrency-plan.mjs'

/**
 * Concurrency checks (T14): the same write fired many times at once must leave the data
 * correct — no double booking, no second team, no match counted twice.
 *
 * STAGING ONLY. Every check writes test data. The script refuses to run against any
 * project but Staging (vorpnkedpscsqhnrssrl), and only with ALLOW_CONCURRENCY_WRITES=true.
 * Use a disposable test venue slot, tournament, team and payment; never real athletes.
 *
 * Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ALLOW_CONCURRENCY_WRITES=true
 * Optional: PARALLEL (default 8). Each check runs only when its inputs are set:
 *   Booking race     BOOKER_JWTS (comma-separated, 1 or more accounts), RACE_SLOT_ID (an open, future slot)
 *   Team race        COACH_JWT, RACE_TOURNAMENT_ID (open tournament)
 *   Payment race     ORGANIZER_JWT, RACE_PAYMENT_ID (a pending payment in that organizer's tournament)
 *   Result repeat    ORGANIZER_JWT, RESULT_TOURNAMENT_ID, RESULT_TEAM_A_ID, RESULT_TEAM_B_ID,
 *                    RESULT_PLAYER_RANK_ID (a ranked player in team A, with a rating row)
 *
 * Exit code 1 when any check fails. Missing inputs are reported as SKIP, never as PASS.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const refusal = assertMayRun(url, process.env.ALLOW_CONCURRENCY_WRITES)
if (refusal) {
  console.error(`Not running: ${refusal}`)
  process.exit(1)
}
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const parallel = Math.max(2, Math.min(50, Number(process.env.PARALLEL) || 8))
let failures = 0

async function call(jwt, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${url}/rest/v1${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = text
  try { parsed = text ? JSON.parse(text) : null } catch { /* keep text */ }
  return { status: response.status, body: parsed }
}
const rpc = (jwt, name, args) => call(jwt, `/rpc/${name}`, { method: 'POST', body: args })
const burst = (make) => Promise.all(Array.from({ length: parallel }, (_, index) => make(index)))

function report(label, verdict) {
  if (!verdict.passed) failures += 1
  console.log(`${verdict.passed ? 'PASS' : 'FAIL'} ${label}: ${verdict.detail}`)
}
const skip = (label, needs) => console.log(`SKIP ${label}: set ${needs}`)
const env = name => process.env[name]

console.log(`Concurrency checks against Staging, ${parallel} simultaneous requests each.`)

// 1. Several people ask for the same slot at the same moment: one booking, never two.
{
  const label = 'booking race: one open slot, simultaneous requests'
  const jwts = (env('BOOKER_JWTS') ?? '').split(',').map(item => item.trim()).filter(Boolean)
  if (!jwts.length || !env('RACE_SLOT_ID')) skip(label, 'BOOKER_JWTS and RACE_SLOT_ID')
  else {
    const answers = await burst(index => rpc(jwts[index % jwts.length], 'request_venue_booking_safely', {
      p_slot_id: env('RACE_SLOT_ID'), p_purpose: 'T14 concurrency test', p_note: 'automated, please ignore',
    }))
    report(label, judgeOneWinner(answers, ['SLOT_ALREADY_REQUESTED', 'SLOT_UNAVAILABLE']))
  }
}

// 2. A coach double-submits team registration: at most one team for that tournament.
{
  const label = 'team race: one coach registers the same tournament repeatedly'
  if (!env('COACH_JWT') || !env('RACE_TOURNAMENT_ID')) skip(label, 'COACH_JWT and RACE_TOURNAMENT_ID')
  else {
    const answers = await burst(() => rpc(env('COACH_JWT'), 'create_tournament_team_safely', {
      p_tournament_id: env('RACE_TOURNAMENT_ID'), p_name: 'T14 concurrency team',
    }))
    report(label, judgeAtMostOne(answers, ['ALREADY_HAS_TEAM_FOR_TOURNAMENT', 'TOURNAMENT_FULL']))
  }
}

// 3. An organizer confirms the same slip repeatedly: every call succeeds, one confirmation.
{
  const label = 'payment race: the same slip confirmed repeatedly'
  if (!env('ORGANIZER_JWT') || !env('RACE_PAYMENT_ID')) skip(label, 'ORGANIZER_JWT and RACE_PAYMENT_ID')
  else {
    const answers = await burst(() => rpc(env('ORGANIZER_JWT'), 'confirm_payment_safely', { p_payment_id: env('RACE_PAYMENT_ID') }))
    const after = await call(env('ORGANIZER_JWT'), `/payments?id=eq.${env('RACE_PAYMENT_ID')}&select=status`)
    const status = Array.isArray(after.body) ? after.body[0]?.status : null
    const verdict = judgeSameAnswer(answers)
    report(label, { passed: verdict.passed && status === 'confirmed', detail: `${verdict.detail}; payment status now ${status}` })
  }
}

// 4. A result confirmed repeatedly (retry, double click): recorded once. The draw that
// moves no rating is the case record_match_result_safely alone could not catch.
{
  const label = 'result repeat: the same submission confirmed simultaneously'
  const needs = ['ORGANIZER_JWT', 'RESULT_TOURNAMENT_ID', 'RESULT_TEAM_A_ID', 'RESULT_TEAM_B_ID', 'RESULT_PLAYER_RANK_ID']
  if (needs.some(name => !env(name))) skip(label, needs.join(', '))
  else {
    const jwt = env('ORGANIZER_JWT')
    const rank = await call(jwt, `/player_ranks?id=eq.${env('RESULT_PLAYER_RANK_ID')}&select=sport,season`)
    const { sport, season } = (Array.isArray(rank.body) && rank.body[0]) || {}
    const rating = sport ? await call(jwt, `/player_ratings?player_rank_id=eq.${env('RESULT_PLAYER_RANK_ID')}&sport=eq.${sport}&season=eq.${season}&select=power_rating`) : null
    const power = Array.isArray(rating?.body) ? rating.body[0]?.power_rating : undefined
    if (power === undefined) skip(label, 'a RESULT_PLAYER_RANK_ID with a player_ratings row')
    else {
      const startedAt = new Date(Date.now() - 1000).toISOString()
      const requestId = crypto.randomUUID()
      const answers = await burst(() => rpc(jwt, 'record_match_result_once', {
        p_request_id: requestId, p_tournament_id: env('RESULT_TOURNAMENT_ID'),
        p_team_a_id: env('RESULT_TEAM_A_ID'), p_team_b_id: env('RESULT_TEAM_B_ID'), p_team_a_score: 0, p_team_b_score: 0,
        p_performances: unchangedDrawPayload({ playerRankId: env('RESULT_PLAYER_RANK_ID'), teamId: env('RESULT_TEAM_A_ID'), rating: power }),
      }))
      if (answers.some(answer => answer.status === 404 && JSON.stringify(answer.body).includes('PGRST202'))) {
        report(label, { passed: false, detail: 'record_match_result_once is missing: apply sql/60-match-result-request-id-v1.sql' })
      } else {
        const rows = await call(jwt, `/match_results?tournament_id=eq.${env('RESULT_TOURNAMENT_ID')}&created_at=gte.${encodeURIComponent(startedAt)}&select=id`)
        const recorded = Array.isArray(rows.body) ? rows.body.length : -1
        const verdict = judgeSameAnswer(answers)
        report(label, { passed: verdict.passed && recorded === 1, detail: `${verdict.detail}; match_results rows written: ${recorded}. Void the test result afterwards in /dashboard/results.` })
      }
    }
  }
}

console.log(failures ? `${failures} check(s) failed.` : 'Done: no failed checks (see SKIP lines for checks that did not run).')
process.exit(failures ? 1 : 0)
