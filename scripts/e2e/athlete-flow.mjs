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
import { bangkokToday, E2E_ATHLETE, E2E_GUARDIAN } from './mock-supabase.mjs'
import { createHarness } from './harness.mjs'

const h = await createHarness()
const { state, step, expect, go, visible, mainText, tap, audit, BASE } = h
const page = await h.signedIn(E2E_ATHLETE)
const onceCount = /(?<![\d,])1 ครั้ง/ // "1 ครั้ง", not "11 ครั้ง"


const todayWeekday = (new Date(Date.parse(`${bangkokToday()}T00:00:00Z`)).getUTCDay() + 6) % 7
const daysAgo = days => new Date(Date.parse(`${bangkokToday()}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10)
let programPath = ''
let secondTab = null

await step('choose a goal on /training', async () => {
  await go('/training?tab=programs')
  await audit('/training (goal step)')
  await tap(page.getByRole('button', { name: /คุมบอลดีขึ้น/ }))
  await visible('เป้าหมาย: คุมบอลดีขึ้น')
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
  secondTab = h.watch(await page.context().newPage())
  h.expectLoad()
  await secondTab.goto(BASE + `${programPath}/session`, { waitUntil: 'networkidle' })
  h.focus(page)
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
  h.focus(secondTab)
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

const guardian = await h.signedIn(E2E_GUARDIAN)

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
  h.expectLoad()
  const response = await guardian.goto(`${BASE}/guardian/33333333-3333-4333-8333-333333333333/progress`, { waitUntil: 'networkidle' })
  const text = await guardian.locator('body').innerText()
  expect(!text.includes('ทดสอบ อัตโนมัติ'), 'the page named a child')
  // A real 404 since the root route skeleton went (15 Nov 2026); under it, notFound() streamed a 200.
  expect(response.status() === 404, `status ${response.status()}, not 404`)
})

await step('on a slow connection the goal change waits for the page, with no early full load', async () => {
  // The page data for /training takes 4 seconds, longer than GoalPicker's grace: the picker must
  // wait for the navigation still on its way instead of reloading over it (review, 14 Nov 2026).
  // A full load is allowed only at the ceiling (6 s), when a navigation still pending is stuck.
  const slow = async route => { if (route.request().headers().rsc && !route.request().headers()['next-router-prefetch']) await new Promise(resolve => setTimeout(resolve, 4000)); await route.continue() }
  await go('/training?tab=programs&goal=change')
  await page.route('**/training?*', slow)
  const loads = []
  let clickedAt = 0
  const countLoad = request => { if (request.resourceType() === 'document' && !request.redirectedFrom()) loads.push(Date.now() - clickedAt) }
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
  const early = loads.filter(at => at < 5500)
  expect(early.length === 0, `the picker loaded the page again in full at ${early.join(', ')} ms, while the navigation was on its way`)
})

// Running mode V1 (ADR-016, sql/108): the athlete logs a run alone, a retried save is one run,
// the week is measured against a goal, and a run can be removed.
await step('log a run on the running tab; a retried save is one run', async () => {
  await go('/training?tab=run')
  await visible('บันทึกการวิ่ง')
  await page.getByLabel('ระยะทาง (กม.)').fill('5')
  await page.getByLabel('นาที', { exact: true }).fill('30')
  await tap(page.getByRole('button', { name: 'บันทึก', exact: true }))
  await visible('บันทึกแล้ว')
  const runs = () => state.tables.run_logs.filter(row => row.user_id === E2E_ATHLETE)
  expect(runs().length === 1 && runs()[0].distance_m === 5000 && runs()[0].duration_s === 1800, `runs: ${JSON.stringify(runs())}`)
  await visible('6:00 /กม.')
  // The same request twice (a retry after a lost answer): one run.
  const answers = await page.evaluate(async () => {
    const body = JSON.stringify({ action: 'add', requestId: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()), km: '3', minutes: '20', seconds: '0' })
    const send = () => fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then(response => response.json())
    return [await send(), await send()]
  })
  expect(answers[0].id && answers[0].id === answers[1].id && runs().length === 2, `answers ${JSON.stringify(answers)}, runs ${runs().length}`)
  await audit('/training?tab=run', page)
})

await step('a weekly goal measures this week, and a run can be removed', async () => {
  await go('/training?tab=run')
  await page.getByLabel('เป้ารายสัปดาห์').fill('2')
  await tap(page.getByRole('button', { name: 'ตั้งเป้า', exact: true }))
  await visible('ถึงเป้าแล้ว')
  expect(state.tables.run_goals.some(row => row.user_id === E2E_ATHLETE && row.unit === 'runs' && row.target === 2), `goals: ${JSON.stringify(state.tables.run_goals)}`)
  await tap(page.getByRole('button', { name: /^ลบการวิ่งวันที่/ }).first())
  for (let waited = 0; state.tables.run_logs.length !== 1 && waited < 10000; waited += 100) await page.waitForTimeout(100)
  expect(state.tables.run_logs.length === 1, `runs left: ${state.tables.run_logs.length}`)
})

await h.finish()
