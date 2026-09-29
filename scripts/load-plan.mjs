/**
 * Pure parts of the load test (T39), kept free of I/O so they can be tested: where it may
 * run, what each simulated user does, and how the results are judged.
 *
 * Owner's first target (29 Sep 2026): 200 simultaneous users for 10 minutes, passing when
 * the 95th percentile response is under 1.5 s and fewer than 1% of requests fail.
 */

export const STAGING_REF = 'vorpnkedpscsqhnrssrl'
export const PRODUCTION_REF = 'hivedzrwrrcnjrlirhtv'
// Web hosts that serve Production. A load test never goes there.
export const PRODUCTION_HOSTS = ['ballsai-teal.vercel.app', 'balldoensai.com', 'www.balldoensai.com']

export const DEFAULTS = {
  users: 200,
  durationSeconds: 600,
  rampSeconds: 60,
  thinkMs: [1000, 3000],
  timeoutMs: 10000,
  p95Ms: 1500,
  maxErrorRate: 0.01,
  // /api/match-results allows 20 previews per 5 minutes per user; organizers stay under it.
  organizerPreviewsPerMinute: 3,
}

// Every Supabase project this text (a page or a JavaScript bundle) talks to.
export function findSupabaseRefs(text) {
  return [...new Set([...String(text).matchAll(/\b([a-z]{20})\.supabase\.co\b/g)].map(match => match[1]))]
}

// Refuses unless the target site is wired to Staging and the run was asked for.
export function assertLoadTarget({ targetUrl, refs, allow }) {
  let host
  try { host = new URL(targetUrl).host } catch { return 'set LOAD_TEST_URL to the Staging web address (https://…)' }
  if (PRODUCTION_HOSTS.includes(host)) return `refusing to load Production (${host})`
  if (refs.includes(PRODUCTION_REF)) return `refusing: ${host} talks to the Production database (${PRODUCTION_REF})`
  // A local build (for checking the script itself) never reaches Staging or Production.
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  if (local && allow === 'local') return null
  if (!refs.includes(STAGING_REF)) return `refusing: could not confirm ${host} talks to Staging (${STAGING_REF}); found ${refs.join(', ') || 'no Supabase project'}`
  if (allow !== 'true') return 'set ALLOW_LOAD_TEST=true: this sends heavy traffic to the target site and its database'
  return null
}

// Picks a scenario by weight; random is a number in [0, 1).
export function pickScenario(scenarios, random) {
  const total = scenarios.reduce((sum, item) => sum + item.weight, 0)
  let point = random * total
  for (const scenario of scenarios) {
    if (point < scenario.weight) return scenario
    point -= scenario.weight
  }
  return scenarios[scenarios.length - 1]
}

// A sample is { route, ms, status, location?, signedIn?, error? }. A signed-in page that
// sends the user to /login means the session was not accepted, which is a failure, not a
// fast success.
export function classify(sample) {
  if (sample.status === 429) return 'rate_limited'
  if (sample.error || !sample.status) return 'error'
  if (sample.signedIn && sample.status >= 300 && sample.status < 400 && /^\/login/.test(sample.location ?? '')) return 'error'
  return sample.status < 400 ? 'ok' : 'error'
}

// Nearest-rank percentile of already-collected values.
export function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

function stats(samples) {
  const ms = samples.map(sample => sample.ms)
  const kinds = samples.map(classify)
  return {
    requests: samples.length,
    errors: kinds.filter(kind => kind === 'error').length,
    rateLimited: kinds.filter(kind => kind === 'rate_limited').length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99),
    max: ms.length ? Math.max(...ms) : 0,
  }
}

export function summarize(samples) {
  const byRoute = {}
  for (const sample of samples) (byRoute[sample.route] ??= []).push(sample)
  return {
    overall: stats(samples),
    routes: Object.fromEntries(Object.entries(byRoute).map(([route, items]) => [route, stats(items)])),
  }
}

// PASS only with every scenario run and both thresholds met. A skipped scenario can never
// count as a pass: it reports PARTIAL.
export function judge(summary, thresholds, skipped) {
  const { requests, errors, rateLimited, p95 } = summary.overall
  const errorRate = requests ? errors / requests : 1
  const limitedRate = requests ? rateLimited / requests : 0
  const reasons = []
  if (!requests) reasons.push('no requests completed')
  if (p95 > thresholds.p95Ms) reasons.push(`p95 ${p95} ms > ${thresholds.p95Ms} ms`)
  if (errorRate > thresholds.maxErrorRate) reasons.push(`errors ${(errorRate * 100).toFixed(2)}% > ${thresholds.maxErrorRate * 100}%`)
  if (limitedRate > thresholds.maxErrorRate) reasons.push(`rate-limited ${(limitedRate * 100).toFixed(2)}% > ${thresholds.maxErrorRate * 100}%`)
  const verdict = reasons.length ? 'FAIL' : skipped.length ? 'PARTIAL' : 'PASS'
  if (verdict === 'PARTIAL') reasons.push(`scenario(s) not run: ${skipped.join(', ')}`)
  return { verdict, errorRate, limitedRate, reasons }
}
