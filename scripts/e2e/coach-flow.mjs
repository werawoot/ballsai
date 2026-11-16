// End-to-end check of a coach's own team in a real browser (owner, 15 Nov 2026: the plan's item 5,
// "the coach pages, as the athlete flow does"). Same harness as athlete-flow.mjs. It walks:
//   a coach makes a team with no tournament → the team page and its join link → an athlete opens
//   the link and asks to join → the coach accepts → the athlete is on the roster → the coach
//   deletes the team by typing its name.
// Every write is checked in the mock's rows; every page is audited with axe-core. See docs/e2e.md.
import { E2E_ATHLETE, E2E_COACH } from './mock-supabase.mjs'
import { createHarness } from './harness.mjs'

const h = await createHarness()
const { state, step, expect, go, visible, tap, audit } = h
const coach = await h.signedIn(E2E_COACH)
const TEAM_NAME = 'ทีมทดสอบ อัตโนมัติ'
let teamPath = ''
let joinToken = ''

await step('a coach makes a team of their own, with no tournament', async () => {
  await go('/team-members')
  await audit('/team-members (coach, no team yet)')
  await coach.getByLabel('ชื่อทีม').fill(TEAM_NAME)
  await tap(coach.getByRole('button', { name: 'สร้างทีม', exact: true }))
  await coach.waitForURL(/\/team-members\/[0-9a-f-]{36}$/, { timeout: 15000 })
  teamPath = new URL(coach.url()).pathname
  const teams = state.tables.teams.filter(row => row.created_by === E2E_COACH)
  expect(teams.length === 1 && teams[0].name === TEAM_NAME && teams[0].kind === 'club' && teams[0].tournament_id === null, `teams: ${JSON.stringify(teams)}`)
  expect(teamPath.endsWith(teams[0].id), `landed on ${teamPath}`)
})

await step('the team page shows the team and a join link', async () => {
  await visible(TEAM_NAME, coach)
  await visible('ยังไม่มีคำขอ ส่งลิงก์ด้านล่างให้นักกีฬาเพื่อเริ่ม', coach)
  const url = await coach.getByLabel('ลิงก์ขอเข้าทีม').inputValue()
  joinToken = url.match(/([0-9a-f]{32})/)?.[1] ?? ''
  expect(joinToken && state.tables.team_join_links.some(row => row.token === joinToken && row.open), `join link: ${url}`)
  await audit(`${teamPath} (coach)`, coach)
})

const athlete = await h.signedIn(E2E_ATHLETE)

await step('an athlete opens the link and asks to join', async () => {
  await go(`/join/${joinToken}`, athlete)
  await visible(TEAM_NAME, athlete)
  await audit('/join/[token]', athlete)
  await tap(athlete.getByRole('button', { name: 'ขอเข้าทีม', exact: true }))
  for (let waited = 0; !state.tables.team_join_requests.length && waited < 10000; waited += 100) await athlete.waitForTimeout(100)
  const requests = state.tables.team_join_requests.filter(row => row.athlete_id === E2E_ATHLETE)
  expect(requests.length === 1 && requests[0].status === 'pending', `requests: ${JSON.stringify(requests)}`)
})

await step('asking again changes nothing', async () => {
  await go(`/join/${joinToken}`, athlete)
  // Wait for the app's own answer, so a click that errors or does nothing fails here.
  const answer = athlete.waitForResponse(response => new URL(response.url()).pathname === '/api/team-join' && response.request().method() === 'POST', { timeout: 10000 })
  await tap(athlete.getByRole('button', { name: 'ขอเข้าทีม', exact: true }))
  const body = await (await answer).json().catch(() => null)
  expect(body?.data === 'already_requested', `the app answered ${JSON.stringify(body)}`)
  expect(state.tables.team_join_requests.filter(row => row.athlete_id === E2E_ATHLETE).length === 1, 'a second request was written')
})

await step('the coach accepts, and the athlete is on the roster', async () => {
  await go(teamPath, coach)
  await visible('ทดสอบ อัตโนมัติ', coach)
  await tap(coach.getByRole('button', { name: 'รับเข้าทีม', exact: true }))
  await visible('รับ ทดสอบ อัตโนมัติ เข้าทีมแล้ว', coach)
  const members = state.tables.team_members.filter(row => row.athlete_id === E2E_ATHLETE && row.status === 'accepted')
  expect(members.length === 1, `members: ${JSON.stringify(state.tables.team_members)}`)
  expect(state.tables.team_join_requests[0].status === 'accepted', `the request is ${state.tables.team_join_requests[0].status}`)
  await go(teamPath, coach)
  await visible('ยังไม่มีคำขอ ส่งลิงก์ด้านล่างให้นักกีฬาเพื่อเริ่ม', coach)
  await audit(`${teamPath} (coach, one member)`, coach)
})

await step('the coach deletes the team by typing its name', async () => {
  await coach.getByText('ลบทีม', { exact: true }).click()
  const confirm = coach.getByRole('button', { name: 'ลบทีมนี้ถาวร', exact: true })
  expect(await confirm.isDisabled(), 'delete was possible before the name was typed')
  await coach.locator('#tp-delete-name').fill(TEAM_NAME)
  await tap(confirm)
  await coach.waitForURL(url => new URL(url).pathname === '/team-members', { timeout: 15000 })
  expect(state.tables.teams.length === 0, `teams left: ${state.tables.teams.length}`)
  const left = ['team_members', 'team_join_links', 'team_join_requests', 'team_staff'].filter(table => state.tables[table].length)
  expect(left.length === 0, `rows of the team were left in ${left.join(', ')}`)
})

await h.finish()
