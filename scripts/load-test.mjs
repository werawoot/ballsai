import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { DEFAULTS, assertLoadTarget, findSupabaseRefs, judge, pickScenario, summarize } from './load-plan.mjs'

/**
 * Load test (T39): simulated users on the web app at the same time, measuring how long
 * each page takes and how many fail. Owner's first target: 200 users, 10 minutes,
 * p95 < 1.5 s, errors < 1%.
 *
 * STAGING ONLY. Before sending any load the script reads the target site's own
 * JavaScript, finds the Supabase project it talks to, and refuses unless that is Staging
 * (vorpnkedpscsqhnrssrl) and ALLOW_LOAD_TEST=true. A Vercel Preview may be wired to the
 * Production database, so the web address alone is not trusted.
 *
 * Required: LOAD_TEST_URL (the Staging web address), ALLOW_LOAD_TEST=true
 * Optional: USERS (200), DURATION_SECONDS (600), RAMP_SECONDS (60), REPORT_PATH
 *   Signed-in users (25%)  SIGNED_IN_COOKIE  the Cookie header of a signed-in test athlete
 *   Organizers (5%)        ORGANIZER_COOKIE, RESULT_TOURNAMENT_ID, RESULT_TEAM_A_ID,
 *                          RESULT_TEAM_B_ID, RESULT_PLAYER_RANK_ID (a ranked test player)
 * Cookies are read from the environment only and never printed or written to the report.
 * A scenario without its inputs is SKIPPED and the verdict is PARTIAL, never PASS.
 *
 * Exit code: 0 PASS, 1 FAIL or refused, 3 PARTIAL.
 */

const env = process.env
const target = (env.LOAD_TEST_URL ?? '').replace(/\/$/, '')
const config = {
  ...DEFAULTS,
  users: Math.max(1, Math.min(2000, Number(env.USERS) || DEFAULTS.users)),
  durationSeconds: Math.max(10, Number(env.DURATION_SECONDS) || DEFAULTS.durationSeconds),
  rampSeconds: Math.max(0, Number(env.RAMP_SECONDS ?? DEFAULTS.rampSeconds)),
}

// --- Guard: which database does this site talk to? ---------------------------------
async function supabaseRefsOf(url) {
  const html = await fetch(url, { signal: AbortSignal.timeout(15000) }).then(response => response.text())
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(match => match[1]))].slice(0, 80)
  const texts = await Promise.all(scripts.map(src =>
    fetch(new URL(src, url), { signal: AbortSignal.timeout(15000) }).then(response => response.text()).catch(() => '')))
  return findSupabaseRefs([html, ...texts].join('\n'))
}

let refs = []
try { refs = target ? await supabaseRefsOf(target) : [] } catch (error) {
  console.error(`Not running: could not read ${target} (${error.message})`)
  process.exit(1)
}
const refusal = assertLoadTarget({ targetUrl: target, refs, allow: env.ALLOW_LOAD_TEST })
if (refusal) {
  console.error(`Not running: ${refusal}`)
  process.exit(1)
}

// --- Scenarios ----------------------------------------------------------------------
const PUBLIC_PATHS = ['/', '/ranking', '/ranking?page=2', '/ranking?view=emerging', '/athletes', '/athletes?page=2', '/tournaments', '/hall-of-fame', '/venues', '/api/health']
const SIGNED_IN_PATHS = ['/profile', '/card', '/career', '/notifications']
const organizerReady = ['ORGANIZER_COOKIE', 'RESULT_TOURNAMENT_ID', 'RESULT_TEAM_A_ID', 'RESULT_TEAM_B_ID', 'RESULT_PLAYER_RANK_ID'].every(name => env[name])
const scenarios = [
  { name: 'public', weight: 70, ready: true },
  { name: 'signed-in', weight: 25, ready: Boolean(env.SIGNED_IN_COOKIE) },
  { name: 'organizer', weight: 5, ready: organizerReady },
]
const skipped = scenarios.filter(scenario => !scenario.ready).map(scenario => scenario.name)
const runnable = scenarios.filter(scenario => scenario.ready)

// A player page to include, taken from the ranking the test is about to load.
const firstPlayer = await fetch(`${target}/ranking`).then(response => response.text()).then(html => html.match(/href="(\/players\/[^"?#]+)"/)?.[1]).catch(() => null)
if (firstPlayer) PUBLIC_PATHS.push(firstPlayer)

const samples = []
const random = list => list[Math.floor(Math.random() * list.length)]
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function request(route, { cookie, signedIn = false, method = 'GET', body } = {}) {
  const started = performance.now()
  const sample = { route, signedIn, at: Date.now() }
  try {
    const response = await fetch(`${target}${route}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(config.timeoutMs),
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), 'user-agent': 'ballsai-load-test/T39' },
      body: body ? JSON.stringify(body) : undefined,
    })
    await response.arrayBuffer()
    sample.status = response.status
    sample.location = response.headers.get('location')?.replace(target, '') ?? undefined
  } catch (error) {
    sample.status = 0
    sample.error = error.name === 'TimeoutError' ? 'timeout' : error.message
  }
  sample.ms = Math.round(performance.now() - started)
  samples.push(sample)
}

// Organizers share a budget under the API's preview limit; without a token they browse.
let previewTokens = config.organizerPreviewsPerMinute
setInterval(() => { previewTokens = config.organizerPreviewsPerMinute }, 60000).unref()
const previewBody = () => ({
  mode: 'preview', tournamentId: env.RESULT_TOURNAMENT_ID, teamAId: env.RESULT_TEAM_A_ID, teamBId: env.RESULT_TEAM_B_ID,
  teamAScore: 1, teamBScore: 0, performances: [{ playerRankId: env.RESULT_PLAYER_RANK_ID, teamId: env.RESULT_TEAM_A_ID, goals: 1 }],
})

async function act(scenario) {
  if (scenario.name === 'public') return request(random(PUBLIC_PATHS))
  if (scenario.name === 'signed-in') return request(random(SIGNED_IN_PATHS), { cookie: env.SIGNED_IN_COOKIE, signedIn: true })
  if (previewTokens > 0) {
    previewTokens -= 1
    return request('/api/match-results', { cookie: env.ORGANIZER_COOKIE, signedIn: true, method: 'POST', body: previewBody() })
  }
  return request('/dashboard/results', { cookie: env.ORGANIZER_COOKIE, signedIn: true })
}

// --- Run ------------------------------------------------------------------------------
console.log(`Load test: ${config.users} users, ${config.durationSeconds}s (ramp ${config.rampSeconds}s) against ${new URL(target).host} (database ${refs.join(', ') || 'local'})`)
if (skipped.length) console.log(`SKIP ${skipped.join(', ')}: inputs not set; the verdict can be PARTIAL at best`)

const rampEndAt = Date.now() + config.rampSeconds * 1000
const endAt = rampEndAt + config.durationSeconds * 1000
async function user(index) {
  await sleep(config.users > 1 ? (index * config.rampSeconds * 1000) / config.users : 0)
  while (Date.now() < endAt) {
    await act(pickScenario(runnable, Math.random()))
    await sleep(config.thinkMs[0] + Math.random() * (config.thinkMs[1] - config.thinkMs[0]))
  }
}

let reported = 0
const progress = setInterval(() => {
  const recent = samples.slice(reported); reported = samples.length
  const s = summarize(recent).overall
  console.log(`  +30s: ${s.requests} requests, p95 ${s.p95} ms, errors ${s.errors}, rate-limited ${s.rateLimited}`)
}, 30000)
await Promise.all(Array.from({ length: config.users }, (_, index) => user(index)))
clearInterval(progress)

// Only the steady part is judged: requests that started once every user was running.
const steady = samples.filter(sample => sample.at >= rampEndAt)
const summary = summarize(steady)
const verdict = judge(summary, config, skipped)
const o = summary.overall
console.log(`\n${verdict.verdict}: ${o.requests} requests, p50 ${o.p50} ms, p95 ${o.p95} ms, p99 ${o.p99} ms, errors ${(verdict.errorRate * 100).toFixed(2)}%, rate-limited ${(verdict.limitedRate * 100).toFixed(2)}%`)
for (const reason of verdict.reasons) console.log(`  - ${reason}`)
console.log('\nroute                          requests    p50    p95    p99  errors  429')
for (const [route, s] of Object.entries(summary.routes).sort((a, b) => b[1].p95 - a[1].p95)) {
  console.log(`${route.padEnd(30)} ${String(s.requests).padStart(8)} ${String(s.p50).padStart(6)} ${String(s.p95).padStart(6)} ${String(s.p99).padStart(6)} ${String(s.errors).padStart(7)} ${String(s.rateLimited).padStart(4)}`)
}
console.log(`(${samples.length - steady.length} requests during the ramp-up are not judged)`)
const errorsBySample = {}
for (const sample of steady.filter(item => item.error || item.status >= 400 || (item.signedIn && /^\/login/.test(item.location ?? '')))) {
  const key = `${sample.route} ${sample.error ?? sample.status}${sample.location ? ` -> ${sample.location}` : ''}`
  errorsBySample[key] = (errorsBySample[key] ?? 0) + 1
}
if (Object.keys(errorsBySample).length) console.log('\nfailures:', errorsBySample)

const reportPath = env.REPORT_PATH || `load-test-report-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
writeFileSync(reportPath, JSON.stringify({
  target: new URL(target).host, database: refs, config, skipped, verdict, summary, failures: errorsBySample, finishedAt: new Date().toISOString(),
}, null, 2))
console.log(`\nreport: ${reportPath}`)
process.exit(verdict.verdict === 'PASS' ? 0 : verdict.verdict === 'PARTIAL' ? 3 : 1)
