// T59 / T62: how many requests the server render of a signed-in page sends to Supabase, and in how
// many rounds. Not a pass/fail check: it prints one line per role and page. Run it against the e2e
// build (docs/e2e.md). The mock answers each request 50 ms late (E2E_MOCK_DELAY_MS, set here unless
// given), so reads made one after another show as separate rounds; requests that reach the mock
// within ROUND_GAP_MS of each other are one round, so keep the delay at least twice that gap:
//
//   PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs node scripts/e2e/request-count.mjs
//
// db: data reads during the page's own render, and how many rounds the page waits on them.
// auth(page): /auth/v1/user calls before the last data round (middleware, then the page).
// auth(after): /auth/v1/user calls once the page is in, from <Link> prefetches of other pages.
// Prefetches (checked 20 Nov 2026) stop at the middleware and layout: they add Auth calls but no data
// read, so db= is the page's own. A coach in the mock has no teams, so the two roster rounds of
// /team-members (the roster, then the names) are not seen.
process.env.E2E_MOCK_DELAY_MS ??= '50'
const ROUND_GAP_MS = 25
if (Number(process.env.E2E_MOCK_DELAY_MS) < ROUND_GAP_MS * 2) throw new Error(`E2E_MOCK_DELAY_MS must be at least ${ROUND_GAP_MS * 2}`)
// Imported after the delay is set: the mock reads it when it loads.
const { createHarness } = await import('./harness.mjs')
const { E2E_ATHLETE, E2E_COACH, E2E_GUARDIAN } = await import('./mock-supabase.mjs')

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
