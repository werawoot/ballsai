// End-to-end check of the athlete's main path in a real browser (owner, 13 Nov 2026: "ทำเลยครับ"
// to a browser click test plus an accessibility audit). What the rendering tests cannot show: that
// the buttons work. Against a production build of the app that talks to
// scripts/e2e/mock-supabase.mjs, it signs in as one athlete and walks:
//   choose a goal → open a programme → set the schedule → the pain question → tick the drills →
//   "done" (and the same session finished in a second tab) → /progress → a self-test result,
//   corrected the same day → the history and a delete → the home reminder, first time and due
//   again → the guardian's view of the child, and a not-found for a child who is not theirs.
// On every page it also runs axe-core (WCAG 2.1 A/AA rules) and fails on serious or critical
// findings. It writes nothing outside the mock's memory. See docs/e2e.md.
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createState, startMock, bangkokToday, E2E_ATHLETE, E2E_GUARDIAN } from './mock-supabase.mjs'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100'
const OUT = process.env.E2E_OUT || new URL('../../.e2e-out/', import.meta.url).pathname
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
mkdirSync(OUT, { recursive: true })

const state = createState()
const mock = await startMock(state)
const browser = await chromium.launch()
const pageErrors = []

const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url')
// A browser signed in as one of the mock's users: the @supabase/ssr session cookie, unsigned.
async function signedIn(userId) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, exp: expiresAt, role: 'authenticated', aud: 'authenticated' })}.e2e`
  const session = { access_token: accessToken, refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: state.users[userId] }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' })
  await context.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' }])
  return watch(await context.newPage())
}
function watch(tab) {
  tab.on('pageerror', error => pageErrors.push(error.message))
  tab.on('dialog', dialog => dialog.accept())
  // Page data the browser asks the app for (React Server Component requests), for the failure report.
  tab.on('request', request => { if (request.headers().rsc) state.trace.push([Date.now(), 'browser', request.headers()['next-router-prefetch'] ? 'prefetch' : 'rsc', new URL(request.url()).pathname]) })
  tab.on('requestfinished', request => { if (request.headers().rsc) state.trace.push([Date.now(), 'browser', 'done', new URL(request.url()).pathname]) })
  tab.on('requestfailed', request => { if (request.headers().rsc) state.trace.push([Date.now(), 'browser', 'aborted', new URL(request.url()).pathname]) })
  tab.on('response', response => { if (response.request().headers().rsc) state.trace.push([Date.now(), 'browser', 'headers', new URL(response.url()).pathname]) })
  return tab
}

const page = await signedIn(E2E_ATHLETE)
let current = page

const results = []
async function step(name, run) {
  const startedAt = Date.now()
  try {
    await run()
    results.push({ name, ok: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, ok: false })
    const shot = `${OUT}${results.length}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`
    await current.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}\n     screenshot: ${shot}`)
    // What happened during the step, in order, so a failure can be told apart from a slow page.
    for (const [at, source, kind, path] of state.trace.filter(entry => entry[0] >= startedAt).slice(-60)) console.log(`     ${String(at - startedAt).padStart(6)}ms ${source.padEnd(7)} ${kind.padEnd(8)} ${path}`)
  }
}
const expect = (ok, message) => { if (!ok) throw new Error(message) }
const go = async (path, tab = page) => { current = tab; await tab.goto(BASE + path, { waitUntil: 'networkidle' }) }
const visible = (text, tab = page) => tab.getByText(text).first().waitFor({ timeout: 10000 })
const mainText = async (tab = page) => (await tab.locator('main').innerText()).replace(/\s+/g, ' ')
const onceCount = /(?<![\d,])1 ครั้ง/ // "1 ครั้ง", not "11 ครั้ง"

// Click only once React has attached its handlers to the element. A tap before that does nothing
// (an open finding, docs/e2e.md); the test waits for hydration rather than clicking twice, so a
// click that still does nothing fails.
async function tap(locator) {
  await locator.waitFor({ timeout: 10000 })
  await locator.evaluate(element => new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => Object.keys(element).some(key => key.startsWith('__reactProps')) ? resolve() : Date.now() - started > 10000 ? reject(new Error('never hydrated')) : setTimeout(check, 50)
    check()
  }))
  await locator.click()
}

const a11y = []
let contrastUnmeasured = 0
async function audit(label, tab = page) {
  // Judge the settled page, not a frame of a fade: after a client-side move between a glass page
  // and a Matchday page the bottom bar's colours ease over .18s (globals.css), and a frame caught
  // mid-way reads as low contrast (measured: it settles by itself). Endless animations are left
  // out of the wait, and the wait is capped at 2 seconds.
  await tab.waitForTimeout(400)
  await tab.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter(item => item.effect?.getComputedTiming().endTime !== Infinity).map(item => item.finished.catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, 2000)),
  ]))
  await tab.addScriptTag({ content: AXE })
  const found = await tab.evaluate(async () => {
    const report = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return {
      violations: report.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length, target: item.nodes[0]?.target?.join(' '), detail: item.nodes[0]?.any?.[0]?.message ?? '' })),
      // Text over a photo or a gradient: axe cannot measure it and lists it as "incomplete".
      unmeasured: report.incomplete.filter(item => item.id === 'color-contrast').reduce((sum, item) => sum + item.nodes.length, 0),
    }
  })
  contrastUnmeasured += found.unmeasured
  for (const item of found.violations) a11y.push({ page: label, ...item })
}

const todayWeekday = (new Date(Date.parse(`${bangkokToday()}T00:00:00Z`)).getUTCDay() + 6) % 7
const daysAgo = days => new Date(Date.parse(`${bangkokToday()}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10)
let programPath = ''
let secondTab = null

await step('choose a goal on /training', async () => {
  await go('/training?tab=programs')
  await audit('/training (goal step)')
  // GoalPicker loads the page again in full when Next cancels the navigation after the save
  // (docs/e2e.md); count it, so the run says how often that happened, not just that it passed.
  let fullLoads = 0
  const countLoad = request => { if (request.resourceType() === 'document') fullLoads += 1 }
  page.on('request', countLoad)
  await tap(page.getByRole('button', { name: /คุมบอลดีขึ้น/ }))
  await visible('เป้าหมาย: คุมบอลดีขึ้น')
  page.off('request', countLoad)
  if (fullLoads) console.log('NOTE goal: the navigation after the save was cancelled; the picker loaded the page again in full')
  const goals = state.tables.athlete_training_goals.filter(row => row.athlete_id === E2E_ATHLETE && row.ended_at == null)
  expect(goals.length === 1 && goals[0].goal_key === 'ball_control', `current goals: ${JSON.stringify(goals)}`)
  await audit('/training (programmes)')
})

await step('open a programme and start it', async () => {
  const first = page.locator('a.tg-program:not(.is-locked)').first()
  programPath = await first.getAttribute('href')
  await first.click()
  await page.waitForURL(`**${programPath}`)
  await audit(programPath)
  await page.getByRole('link', { name: 'เริ่มโปรแกรมนี้' }).click()
  await page.waitForURL('**/start')
})

await step('set the schedule with today in it', async () => {
  await audit(`${programPath}/start`)
  const days = page.locator('.tr-days button')
  const confirm = page.locator('button.ui-btn-primary')
  for (const offset of [0, 2, 4, 1, 3, 5, 6]) {
    if (await confirm.isEnabled()) break
    const button = days.nth((todayWeekday + offset) % 7)
    if ((await button.getAttribute('aria-pressed')) !== 'true') await tap(button)
  }
  expect(await confirm.isEnabled(), 'the schedule could not be confirmed')
  await tap(confirm)
  await page.waitForURL('**/session')
  expect(state.tables.training_enrollments.filter(row => row.status === 'active').length === 1, 'enrollment not saved')
})

await step('answer the pain question, tick every drill, and finish', async () => {
  // The same session open in a second tab before the first finishes it (finished in the next step).
  secondTab = watch(await page.context().newPage())
  await secondTab.goto(BASE + `${programPath}/session`, { waitUntil: 'networkidle' })
  current = page
  await audit(`${programPath}/session (pain question)`)
  await tap(page.getByRole('button', { name: 'ไม่เจ็บ เริ่มซ้อม' }))
  await audit(`${programPath}/session (drills)`)
  const ticks = page.locator('button.tr-tick')
  const count = await ticks.count()
  expect(count > 0, 'no drills to tick')
  for (let index = 0; index < count; index++) await tap(ticks.nth(index))
  await tap(page.getByRole('button', { name: 'ซ้อมเสร็จ', exact: true }))
  await visible('ซ้อมเสร็จแล้ว!')
  expect(state.tables.training_checkins.length === 1, 'check-in not saved')
  await audit(`${programPath}/session (done)`)
})

await step('finishing the same session in the other tab keeps one check-in', async () => {
  current = secondTab
  await tap(secondTab.getByRole('button', { name: 'ไม่เจ็บ เริ่มซ้อม' }))
  const ticks = secondTab.locator('button.tr-tick')
  for (let index = 0, count = await ticks.count(); index < count; index++) await tap(ticks.nth(index))
  await tap(secondTab.getByRole('button', { name: 'ซ้อมเสร็จ', exact: true }))
  await visible('ซ้อมเสร็จแล้ว!', secondTab)
  expect(state.writes.includes('conflict:training_checkins'), 'the second tab never reached the unique key')
  expect(state.tables.training_checkins.length === 1, 'a second check-in was written')
  await secondTab.close()
})

await step('a later visit the same day shows it as done', async () => {
  await go(`${programPath}/session`)
  await visible('วันนี้ซ้อมแล้ว')
  expect(state.tables.training_checkins.length === 1, 'a second check-in was written')
})

await step('/progress shows the session and the goal', async () => {
  await go('/progress')
  const text = await mainText()
  expect(onceCount.test(text), `no "1 ครั้ง" in: ${text.slice(0, 300)}`)
  await visible('เป้าหมาย: คุมบอลดีขึ้น')
  await audit('/progress')
})

await step('enter a self-test result, then correct it the same day', async () => {
  await go('/progress/tests')
  await audit('/progress/tests (pain question)')
  await tap(page.getByRole('button', { name: 'ไม่เจ็บ เริ่มทดสอบ' }))
  await audit('/progress/tests (cards)')
  const juggling = () => state.tables.athlete_self_tests.filter(row => row.test_key === 'juggling')
  await page.fill('#st-juggling-value', '12')
  await tap(page.locator('#st-juggling-value').locator('xpath=ancestor::form').getByRole('button', { name: 'บันทึกผล' }))
  await visible('ครั้งล่าสุด 12 ครั้ง')
  expect(juggling().length === 1 && juggling()[0].value === 12, `after the first save: ${JSON.stringify(juggling())}`)
  await page.fill('#st-juggling-value', '15')
  await tap(page.getByRole('button', { name: 'แก้ผลของวันนี้' }).first())
  await visible('ครั้งล่าสุด 15 ครั้ง')
  expect(juggling().length === 1 && juggling()[0].value === 15, `after the correction: ${JSON.stringify(juggling())}`)
})

await step('the history lists the result and deletes it', async () => {
  await go('/progress/tests/history?test=juggling')
  await visible('15 ครั้ง')
  await audit('/progress/tests/history')
  await tap(page.getByRole('button', { name: /^ลบผลวันที่/ }).first())
  for (let waited = 0; state.tables.athlete_self_tests.length > 0 && waited < 5000; waited += 100) await page.waitForTimeout(100)
  expect(state.tables.athlete_self_tests.length === 0, `the delete never reached the database (writes: ${state.writes.slice(-3).join(', ')})`)
  await page.waitForFunction(() => !document.querySelector('.st-history li'), null, { timeout: 10000 }).catch(() => { throw new Error('deleted, but the list still shows the row') })
})

await step('the home asks for a first self-test: all three at 14', async () => {
  await go('/profile')
  await audit('/profile (athlete home)')
  const card = page.locator('.pf-test-due')
  await card.waitFor({ timeout: 10000 })
  const text = (await card.innerText()).replace(/\s+/g, ' ')
  expect(text.includes('ลองวัดพัฒนาการครั้งแรก') && text.includes('แบบทดสอบตัวเอง 3 อย่าง'), `reminder says: ${text}`)
})

await step('the home asks again only for the test four weeks old', async () => {
  state.tables.athlete_self_tests.push(
    { id: 'old-juggling', athlete_id: E2E_ATHLETE, test_key: 'juggling', value: 20, test_date: daysAgo(30) },
    { id: 'new-plank', athlete_id: E2E_ATHLETE, test_key: 'plank', value: 40, test_date: daysAgo(3) },
    { id: 'new-jump', athlete_id: E2E_ATHLETE, test_key: 'long_jump', value: 150, test_date: daysAgo(3) },
  )
  await go('/profile')
  const text = (await page.locator('.pf-test-due').innerText()).replace(/\s+/g, ' ')
  expect(text.includes('ถึงเวลาทดสอบแล้ว') && text.includes('แบบทดสอบตัวเอง 1 อย่าง'), `reminder says: ${text}`)
})

const guardian = await signedIn(E2E_GUARDIAN)

await step('the guardian sees the child\'s progress, read only', async () => {
  await go(`/guardian/${E2E_ATHLETE}/progress`, guardian)
  await visible('พัฒนาการของ ทดสอบ อัตโนมัติ', guardian)
  const text = await mainText(guardian)
  expect(onceCount.test(text), `no "1 ครั้ง" in: ${text.slice(0, 300)}`)
  expect(text.includes('คุมบอลดีขึ้น'), 'the goal is missing')
  // Nothing on the page writes: no form, no input, no button but the header's language switch.
  expect(await guardian.locator('main form, main input, main button:not(.bds-lang-switch)').count() === 0, 'the guardian page has a control')
  await audit('/guardian/[athleteId]/progress', guardian)
})

await step('another child\'s id is a not-found page for the guardian', async () => {
  const response = await guardian.goto(`${BASE}/guardian/33333333-3333-4333-8333-333333333333/progress`, { waitUntil: 'networkidle' })
  const text = await guardian.locator('body').innerText()
  expect(!text.includes('ทดสอบ อัตโนมัติ'), 'the page named a child')
  // notFound() under the root loading.tsx streams a 200 with a noindex meta (known, low priority).
  const noindex = await guardian.locator('meta[name="robots"][content*="noindex"]').count()
  expect(response.status() === 404 || noindex > 0, `status ${response.status()} without noindex`)
})

await step('on a slow connection the goal change waits for the page, with no early full load', async () => {
  // The page data for /training takes 5 seconds, longer than GoalPicker's grace: the picker must
  // wait for the navigation still on its way instead of reloading over it (review, 14 Nov 2026).
  // A full load is allowed only at the ceiling (12 s), when a navigation still pending is stuck.
  const slow = async route => { if (route.request().headers().rsc && !route.request().headers()['next-router-prefetch']) await new Promise(resolve => setTimeout(resolve, 5000)); await route.continue() }
  await go('/training?tab=programs&goal=change')
  await page.route('**/training?*', slow)
  const loads = []
  let clickedAt = 0
  const countLoad = request => { if (request.resourceType() === 'document') loads.push(Date.now() - clickedAt) }
  page.on('request', countLoad)
  try {
    clickedAt = Date.now()
    await tap(page.getByRole('button', { name: /แข็งแรงขึ้น/ }))
    await page.getByText('เป้าหมาย: แข็งแรงขึ้น ลดการบาดเจ็บ').first().waitFor({ timeout: 20000 }).catch(async () => {
      const busy = await page.locator('.tg-goal-pick').getAttribute('aria-busy').catch(() => 'no picker')
      throw new Error(`no new goal after 20 s; url ${new URL(page.url()).search}, picker aria-busy ${busy}, full loads at ${loads.join(', ') || 'none'} ms`)
    })
  } finally {
    page.off('request', countLoad)
    await page.unroute('**/training?*', slow)
  }
  const early = loads.filter(at => at < 11500)
  expect(early.length === 0, `the picker loaded the page again in full at ${early.join(', ')} ms, while the navigation was on its way`)
  if (loads.length) console.log(`NOTE slow goal: the navigation was still pending at the ceiling; the picker loaded the page again in full at ${loads.join(', ')} ms`)
})

await step('no script error in the browser', async () => {
  expect(pageErrors.length === 0, pageErrors.join(' | '))
})

await step('the app asked the mock for nothing it does not know', async () => {
  expect(state.unknown.length === 0, [...new Set(state.unknown)].join(' | '))
})

const serious = a11y.filter(item => item.impact === 'serious' || item.impact === 'critical')
console.log(`\naccessibility (axe-core, WCAG 2.1 A/AA): ${a11y.length} finding(s), ${serious.length} serious or critical; ${contrastUnmeasured} text element(s) over a photo or gradient that axe could not measure`)
for (const item of a11y) console.log(`  ${item.impact.padEnd(8)} ${item.id} ×${item.nodes} on ${item.page}: ${item.help} [${item.target}]${item.detail ? `\n           ${item.detail}` : ''}`)
results.push({ name: 'no serious or critical accessibility finding', ok: serious.length === 0 })

await browser.close()
mock.close()
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
