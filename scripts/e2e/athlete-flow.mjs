// End-to-end check of the athlete's main path in a real browser (owner, 13 Nov 2026): what the
// rendering tests cannot show, that the buttons work. Against a production build of the app that
// talks to scripts/e2e/mock-supabase.mjs, it signs in as one athlete and walks:
//   choose a goal → open a programme → set the schedule → the pain question → tick the drills →
//   "done" → the numbers on /progress → a self-test result, corrected the same day → the history
//   and a delete → the reminder on the home.
// At every page it also runs axe-core (WCAG 2.1 A/AA rules) and fails on serious or critical
// findings. It writes nothing outside its own in-memory database.
//
// Run (see docs/e2e.md):
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e \
//   NEXT_PUBLIC_SELF_TESTS=true NEXT_DIST_DIR=.next-e2e npx next build
//   (same env) npx next start -p 3100 &
//   npm run test:e2e
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createState, startMock, E2E_USER } from './mock-supabase.mjs'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100'
const OUT = process.env.E2E_OUT || new URL('../../.e2e-out/', import.meta.url).pathname
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
mkdirSync(OUT, { recursive: true })

const state = createState()
const mock = await startMock(state)

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: E2E_USER, exp, role: 'authenticated', aud: 'authenticated' })}.e2e`
const session = { access_token: jwt, refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: state.user }

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' })
await context.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' }])
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('dialog', dialog => dialog.accept())

const results = []
async function step(name, run) {
  try {
    await run()
    results.push({ name, ok: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, ok: false })
    const shot = `${OUT}${results.length}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}\n     screenshot: ${shot}`)
  }
}
const expect = (ok, message) => { if (!ok) throw new Error(message) }
const go = async path => { await page.goto(BASE + path, { waitUntil: 'networkidle' }) }
const visible = (text, options = {}) => page.getByText(text, options).first().waitFor({ timeout: 10000 })

const a11y = []
async function audit(label) {
  // Judge the settled page, not a frame of a fade: after a client-side move between a glass page
  // and a Matchday page the bottom bar's colours ease over .18s (globals.css), and a frame caught
  // mid-way reads as low contrast.
  await page.waitForTimeout(400)
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))))
  await page.addScriptTag({ content: AXE })
  const found = await page.evaluate(async () => {
    const report = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return report.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length, target: item.nodes[0]?.target?.join(' '), detail: item.nodes[0]?.any?.[0]?.message ?? '' }))
  })
  for (const item of found) a11y.push({ page: label, ...item })
}

const todayWeekday = (new Date(Date.now() + 7 * 3600e3).getUTCDay() + 6) % 7
let programPath = ''

await step('choose a goal on /training', async () => {
  await go('/training?tab=programs')
  await audit('/training (goal step)')
  // A tap in the first moment after load, before React has attached its handlers, does nothing
  // (seen 1 run in 5 here): click again until the goal shows, at most three times.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: /คุมบอลดีขึ้น/ }).click()
    if (await page.getByText('เป้าหมาย: คุมบอลดีขึ้น').first().waitFor({ timeout: 3000 }).then(() => true, () => false)) break
  }
  await visible('เป้าหมาย: คุมบอลดีขึ้น')
  expect(state.tables.athlete_training_goals.some(row => row.goal_key === 'ball_control' && row.ended_at == null), 'goal not saved')
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
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click()
  }
  expect(await confirm.isEnabled(), 'the schedule could not be confirmed')
  await confirm.click()
  await page.waitForURL('**/session')
  expect(state.tables.training_enrollments.length === 1, 'enrollment not saved')
})

await step('answer the pain question, tick every drill, and finish', async () => {
  await audit(`${programPath}/session (pain question)`)
  await page.getByRole('button', { name: 'ไม่เจ็บ เริ่มซ้อม' }).click()
  await audit(`${programPath}/session (drills)`)
  const ticks = page.locator('button.tr-tick')
  const count = await ticks.count()
  expect(count > 0, 'no drills to tick')
  for (let index = 0; index < count; index++) await ticks.nth(index).click()
  await page.getByRole('button', { name: 'ซ้อมเสร็จ', exact: true }).click()
  await visible('ซ้อมเสร็จแล้ว!')
  expect(state.tables.training_checkins.length === 1, 'check-in not saved')
  await audit(`${programPath}/session (done)`)
})

await step('a second visit the same day does not check in twice', async () => {
  await go(`${programPath}/session`)
  await visible('วันนี้ซ้อมแล้ว')
  expect(state.tables.training_checkins.length === 1, 'a second check-in was written')
})

await step('/progress shows the session and the goal', async () => {
  await go('/progress')
  await visible('1 ครั้ง')
  await visible('เป้าหมาย: คุมบอลดีขึ้น')
  await audit('/progress')
})

await step('enter a self-test result, then correct it the same day', async () => {
  await go('/progress/tests')
  await audit('/progress/tests (pain question)')
  await page.getByRole('button', { name: 'ไม่เจ็บ เริ่มทดสอบ' }).click()
  await audit('/progress/tests (cards)')
  await page.fill('#st-juggling-value', '12')
  await page.locator('#st-juggling-value').locator('xpath=ancestor::form').getByRole('button', { name: 'บันทึกผล' }).click()
  await visible('ครั้งล่าสุด 12 ครั้ง')
  await page.fill('#st-juggling-value', '15')
  await page.getByRole('button', { name: 'แก้ผลของวันนี้' }).first().click()
  await visible('ครั้งล่าสุด 15 ครั้ง')
  const rows = state.tables.athlete_self_tests.filter(row => row.test_key === 'juggling')
  expect(rows.length === 1 && rows[0].value === 15, `expected one juggling row of 15, got ${JSON.stringify(rows)}`)
})

await step('the history lists the result and deletes it', async () => {
  await go('/progress/tests/history?test=juggling')
  await visible('15 ครั้ง')
  await audit('/progress/tests/history')
  await page.getByRole('button', { name: /^ลบผลวันที่/ }).first().click()
  await page.waitForFunction(() => !document.querySelector('.st-history li'), null, { timeout: 10000 })
  expect(state.tables.athlete_self_tests.length === 0, 'the result was not deleted')
})

await step('the home reminds the athlete that the self-tests are due', async () => {
  await go('/profile')
  await audit('/profile (athlete home)')
  const card = page.locator('.pf-test-due')
  await card.waitFor({ timeout: 10000 })
  const text = (await card.innerText()).replace(/\s+/g, ' ')
  expect(/3 อย่าง/.test(text), `reminder says: ${text}`)
})

await step('no script error in the browser', async () => {
  expect(pageErrors.length === 0, pageErrors.join(' | '))
})

const serious = a11y.filter(item => item.impact === 'serious' || item.impact === 'critical')
console.log(`\naccessibility (axe-core, WCAG 2.1 A/AA): ${a11y.length} finding(s), ${serious.length} serious or critical`)
for (const item of a11y) console.log(`  ${item.impact.padEnd(8)} ${item.id} ×${item.nodes} on ${item.page}: ${item.help} [${item.target}]${item.detail ? `\n           ${item.detail}` : ''}`)
results.push({ name: 'no serious or critical accessibility finding', ok: serious.length === 0 })

await browser.close()
mock.close()
const failed = results.filter(item => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
