// T59 / T62: how many requests the server render of a signed-in page sends to Supabase, and in how
// many rounds. Not a pass/fail check: it prints one line per role and page. Run it against the e2e
// build (docs/e2e.md) with E2E_MOCK_DELAY_MS=50, so reads made one after another show as rounds:
//
//   E2E_MOCK_DELAY_MS=50 node scripts/e2e/request-count.mjs
//
// db: data reads during the page's own render, and how many rounds the page waits on them.
// auth(page): /auth/v1/user calls before the last data round (middleware, then the page).
// auth(after): /auth/v1/user calls once the page is in, from <Link> prefetches of other pages.
// A signed-in coach in the mock has no teams, so the roster rounds of /team-members are not seen.
import { createHarness } from './harness.mjs'
import { E2E_ATHLETE, E2E_COACH, E2E_GUARDIAN } from './mock-supabase.mjs'

const ROUND_GAP_MS = 25
const isAuth = path => path === '/auth/v1/user'
const h = await createHarness()
for (const [role, userId] of Object.entries({ athlete: E2E_ATHLETE, guardian: E2E_GUARDIAN, coach: E2E_COACH })) {
  const tab = await h.signedIn(userId)
  for (const path of ['/profile', '/team-members', '/guardian', '/career']) {
    await tab.goto(h.BASE + path, { waitUntil: 'networkidle' }) // the first visit compiles and warms caches
    const startedAt = Date.now()
    await tab.goto(h.BASE + path, { waitUntil: 'networkidle' })
    const rounds = []
    for (const [at, source, , requested] of h.state.trace) {
      if (at < startedAt || source !== 'mock') continue
      const last = rounds.at(-1)
      if (last && at - last.at < ROUND_GAP_MS) last.paths.push(requested)
      else rounds.push({ at, paths: [requested] })
    }
    const lastData = rounds.findLastIndex(round => round.paths.some(requested => !isAuth(requested)))
    const dataRounds = rounds.filter(round => round.paths.some(requested => !isAuth(requested))).map(round => round.paths.filter(requested => !isAuth(requested)).length)
    const authCount = list => list.flatMap(round => round.paths).filter(isAuth).length
    console.log(`${role.padEnd(8)} ${path.padEnd(14)} db=${dataRounds.reduce((sum, n) => sum + n, 0)} in ${dataRounds.length} round(s) [${dataRounds.join('+')}]  auth(page)=${authCount(rounds.slice(0, lastData + 1))}  auth(after)=${authCount(rounds.slice(lastData + 1))}`)
  }
  await tab.context().close()
}
process.exit(0)
