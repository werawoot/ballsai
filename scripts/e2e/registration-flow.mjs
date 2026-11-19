// End-to-end check of entering a team in a tournament in a real browser (owner, 19 Nov 2026: "ทำข้อ 4").
// Same harness as athlete-flow.mjs and coach-flow.mjs. A free tournament, so no slip is uploaded
// (Storage is not in the test double). It walks:
//   a coach opens the tournament and names a team → a second team in the same tournament is
//   refused → submit waits for an accepted athlete → an invite to an email with no account is
//   refused, the athlete's email is invited → the athlete accepts → the coach submits → the team
//   is pending → submitting again says it is already submitted, and another account is not allowed.
// Every write is checked in the mock's rows; every page is audited with axe-core. See docs/e2e.md.
import { bangkokToday, E2E_ATHLETE, E2E_COACH, E2E_GUARDIAN } from './mock-supabase.mjs'
import { createHarness } from './harness.mjs'

const TOURNAMENT = '55555555-5555-4555-8555-555555555555'
const inDays = days => new Date(Date.parse(`${bangkokToday()}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10)
const h = await createHarness({
  tournaments: [{
    id: TOURNAMENT, name: 'ฟุตบอลเยาวชน ทดสอบ', description: '', location: 'สนามทดสอบ', start_date: inDays(30), end_date: inDays(31),
    fee: null, max_teams: 8, promptpay: null, status: 'open', organizer_id: '66666666-6666-4666-8666-666666666666', created_at: new Date().toISOString(),
  }],
})
const { state, step, expect, go, visible, tap, audit } = h
const coach = await h.signedIn(E2E_COACH)
const TEAM_NAME = 'ทีมสมัคร อัตโนมัติ'
let teamId = ''
// Submits the team from a signed-in tab, as the page's button does, and returns the app's answer.
const submitFrom = tab => tab.evaluate(async id => {
  const response = await fetch(`/api/teams/${id}/submit`, { method: 'POST' })
  return { status: response.status, body: await response.json().catch(() => null) }
}, teamId)

await step('a coach opens the tournament and names a team', async () => {
  await go(`/tournaments/${TOURNAMENT}`)
  await audit('/tournaments/[id]')
  await tap(coach.getByRole('link', { name: /สมัครทีม/ }).first())
  await coach.waitForURL(url => new URL(url).searchParams.get('step') === 'team', { timeout: 15000 })
  await audit('/tournaments/[id]?step=team')
  await coach.getByLabel('ชื่อทีม').fill(TEAM_NAME)
  await tap(coach.getByRole('button', { name: /สร้างทีมและเชิญสมาชิก/ }))
  await coach.waitForURL(url => new URL(url).pathname === '/team-members' && new URL(url).searchParams.has('team'), { timeout: 15000 })
  teamId = new URL(coach.url()).searchParams.get('team')
  const teams = state.tables.teams.filter(row => row.created_by === E2E_COACH)
  expect(teams.length === 1 && teams[0].id === teamId && teams[0].tournament_id === TOURNAMENT && teams[0].status === 'draft' && teams[0].kind === 'entry', `teams: ${JSON.stringify(teams)}`)
})

await step('a second team in the same tournament is refused', async () => {
  await go(`/tournaments/${TOURNAMENT}?step=team`)
  await coach.getByLabel('ชื่อทีม').fill('ทีมที่สอง')
  await tap(coach.getByRole('button', { name: /สร้างทีมและเชิญสมาชิก/ }))
  await visible('คุณสร้างทีมสำหรับรายการนี้แล้ว')
  expect(state.tables.teams.length === 1, `teams: ${state.tables.teams.length}`)
})

await step('submit waits for an accepted athlete', async () => {
  await go(`/team-members?team=${teamId}`)
  await audit('/team-members (coach, entry draft)')
  expect(await coach.getByRole('button', { name: 'ส่งสมัครรายการ', exact: true }).isDisabled(), 'submit was possible with nobody accepted')
  await visible('ส่งสมัครได้เมื่อมีนักกีฬาตอบรับอย่างน้อย 1 คน')
})

await step('an email with no account is refused, the athlete is invited', async () => {
  const email = coach.getByLabel('อีเมลที่นักกีฬาใช้สมัคร')
  await email.fill('nobody@example.com')
  await tap(coach.getByRole('button', { name: 'ส่งคำเชิญ', exact: true }))
  await visible('ยังไม่มีบัญชีนี้ในระบบ')
  expect(state.tables.team_members.length === 0, 'an invite was written for an unknown email')
  await email.fill('e2e-athlete@example.com')
  await tap(coach.getByRole('button', { name: 'ส่งคำเชิญ', exact: true }))
  await visible('ส่งคำเชิญแล้ว')
  const members = state.tables.team_members.filter(row => row.team_id === teamId)
  expect(members.length === 1 && members[0].athlete_id === E2E_ATHLETE && members[0].status === 'pending', `members: ${JSON.stringify(members)}`)
})

const athlete = await h.signedIn(E2E_ATHLETE)

await step('the athlete accepts the invitation', async () => {
  await go('/team-members', athlete)
  await visible(TEAM_NAME, athlete)
  await audit('/team-members (athlete, invited)', athlete)
  await tap(athlete.getByRole('button', { name: 'เข้าร่วมทีม', exact: true }))
  for (let waited = 0; state.tables.team_members[0]?.status !== 'accepted' && waited < 10000; waited += 100) await athlete.waitForTimeout(100)
  expect(state.tables.team_members[0]?.status === 'accepted', `the invite is ${state.tables.team_members[0]?.status}`)
})

await step('the coach submits and the team is pending', async () => {
  await go(`/team-members?team=${teamId}`, coach)
  await tap(coach.getByRole('button', { name: 'ส่งสมัครรายการ', exact: true }))
  await coach.waitForURL(url => new URL(url).pathname === `/tournaments/${TOURNAMENT}` && new URL(url).searchParams.get('teamId') === teamId, { timeout: 15000 })
  await visible('ส่งสมัครแล้ว', coach)
  await audit('/tournaments/[id]?teamId= (free, submitted)', coach)
  expect(state.tables.teams.find(row => row.id === teamId)?.status === 'pending', `the team is ${state.tables.teams.find(row => row.id === teamId)?.status}`)
})

await step('submitting again says it is already submitted', async () => {
  const answer = await submitFrom(coach)
  expect(answer.status === 409 && answer.body?.code === 'teamAlreadySubmitted', `the app answered ${JSON.stringify(answer)}`)
})

const guardian = await h.signedIn(E2E_GUARDIAN)

await step('another account may not submit the team', async () => {
  await go('/team-members', guardian)
  const answer = await submitFrom(guardian)
  expect(answer.status === 403 && answer.body?.error === 'คุณไม่มีสิทธิ์ส่งสมัครทีมนี้', `the app answered ${JSON.stringify(answer)}`)
})

await h.finish()
