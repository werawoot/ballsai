// End-to-end check of entering a team in a tournament in a real browser (owner, 19 Nov 2026: "ทำข้อ 4").
// Same harness as athlete-flow.mjs and coach-flow.mjs. It walks a free tournament:
//   a coach opens the tournament and names a team → a second team in the same tournament is
//   refused → submit waits for an accepted athlete → an invite to an email with no account is
//   refused, the athlete's email is invited → the athlete accepts → the coach submits → the team
//   is pending → submitting again says it is already submitted, and another account is not allowed.
// Then a tournament with a fee: the team is entered and submitted the same way, the payment step
// shows the amount and the organizer's PromptPay, a file that is not an image is refused, the slip
// is stored privately (an object path in the slips bucket, never a public URL), and a second slip
// for the same team is refused.
// Then the organizer (owner, 21 Nov 2026: "ทำข้อ ข"): /dashboard lists both teams waiting, the paid one
// with its amount and its slip; the slip opens through a 60-second signed URL for the organizer and
// the coach who paid, and for nobody else; the coach cannot confirm their own payment; one tap
// confirms the payment and the team together, a second call changes nothing; the free team is
// confirmed with its own button, which another account cannot do.
// Every write is checked in the mock's rows; every page is audited with axe-core. See docs/e2e.md.
import { bangkokToday, E2E_ATHLETE, E2E_COACH, E2E_GUARDIAN, E2E_ORGANIZER } from './mock-supabase.mjs'
import { createHarness } from './harness.mjs'

const TOURNAMENT = '55555555-5555-4555-8555-555555555555'
const PAID = '77777777-7777-4777-8777-777777777777'
const PROMPTPAY = '0812345678'
const inDays = days => new Date(Date.parse(`${bangkokToday()}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10)
const h = await createHarness({
  tournaments: [{
    id: TOURNAMENT, name: 'ฟุตบอลเยาวชน ทดสอบ', description: '', location: 'สนามทดสอบ', start_date: inDays(30), end_date: inDays(31),
    fee: null, max_teams: 8, promptpay: null, status: 'open', organizer_id: E2E_ORGANIZER, created_at: new Date().toISOString(),
  }, {
    id: PAID, name: 'ฟุตบอลเยาวชน มีค่าสมัคร', description: '', location: 'สนามทดสอบ 2', start_date: inDays(40), end_date: inDays(41),
    fee: 500, max_teams: 8, promptpay: PROMPTPAY, status: 'open', organizer_id: E2E_ORGANIZER, created_at: new Date().toISOString(),
  }],
})
const { state, step, expect, go, visible, tap, audit } = h
const coach = await h.signedIn(E2E_COACH)
const TEAM_NAME = 'ทีมสมัคร อัตโนมัติ'
let teamId = ''
// Posts to the app from a signed-in tab, as the page does, and returns the app's answer. With a file
// ({ name, type, bytes }) the body is a form with that file as "slip", as PaymentStep sends it.
// With json, the body is that object as JSON, as ConfirmTeamButton sends it.
const postFrom = (tab, path, file = null, json = null) => tab.evaluate(async ({ path, file, json }) => {
  let body
  const headers = {}
  if (file) { body = new FormData(); body.append('slip', new File([new Uint8Array(file.bytes)], file.name, { type: file.type })) }
  if (json) { body = JSON.stringify(json); headers['Content-Type'] = 'application/json' }
  const response = await fetch(path, { method: 'POST', body, headers })
  return { status: response.status, body: await response.json().catch(() => null) }
}, { path, file, json })
const submitFrom = tab => postFrom(tab, `/api/teams/${teamId}/submit`)

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

let paidTeamId = ''
const PAID_TEAM = 'ทีมจ่ายเงิน อัตโนมัติ'
// A small real PNG (1x1), as a phone photo of a slip would be an image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

await step('in a tournament with a fee, the team is entered, joined and submitted', async () => {
  h.focus(coach)
  await go(`/tournaments/${PAID}?step=team`, coach)
  await coach.getByLabel('ชื่อทีม').fill(PAID_TEAM)
  await tap(coach.getByRole('button', { name: /สร้างทีมและเชิญสมาชิก/ }))
  await coach.waitForURL(url => new URL(url).pathname === '/team-members' && new URL(url).searchParams.has('team'), { timeout: 15000 })
  paidTeamId = new URL(coach.url()).searchParams.get('team')
  await coach.getByLabel('อีเมลที่นักกีฬาใช้สมัคร').fill('e2e-athlete@example.com')
  await tap(coach.getByRole('button', { name: 'ส่งคำเชิญ', exact: true }))
  await visible('ส่งคำเชิญแล้ว', coach)
  await go('/team-members', athlete)
  await tap(athlete.getByRole('button', { name: 'เข้าร่วมทีม', exact: true }))
  for (let waited = 0; !state.tables.team_members.some(row => row.team_id === paidTeamId && row.status === 'accepted') && waited < 10000; waited += 100) await athlete.waitForTimeout(100)
  await go(`/team-members?team=${paidTeamId}`, coach)
  await tap(coach.getByRole('button', { name: /ส่งสมัครรายการ/ }))
  await coach.waitForURL(url => new URL(url).searchParams.get('teamId') === paidTeamId, { timeout: 15000 })
  expect(state.tables.teams.find(row => row.id === paidTeamId)?.status === 'pending', 'the paid team was not submitted')
})

await step('the payment step shows the amount and the organizer\'s PromptPay', async () => {
  await visible('แนบสลิปโอนเงิน', coach)
  // The amount card itself: "ยอดที่ต้องโอน · ทีม <name>", the fee and the organizer's PromptPay.
  const card = (await coach.locator('.tn-amount').innerText()).replace(/\s+/g, ' ')
  expect(new RegExp(`\\b500\\b`).test(card) && card.includes(PROMPTPAY) && card.includes(PAID_TEAM), `amount card says: ${card}`)
  await audit('/tournaments/[id]?teamId= (paid, slip)', coach)
})

await step('a file that is not an image is refused, and nothing is stored', async () => {
  const answer = await postFrom(coach, `/api/teams/${paidTeamId}/payment`, { name: 'slip.txt', type: 'text/plain', bytes: [...Buffer.from('not a slip')] })
  expect(answer.status === 400 && answer.body?.error === 'สลิปต้องเป็นไฟล์ JPG, PNG หรือ WEBP', `the app answered ${JSON.stringify(answer)}`)
  expect(state.storage.length === 0 && state.tables.payments.length === 0, 'something was stored for a refused file')
})

await step('the slip is stored privately and the payment waits for the organizer', async () => {
  await coach.locator('input[type="file"]').setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: PNG })
  await tap(coach.getByRole('button', { name: 'ส่งสลิปให้ผู้จัดตรวจ', exact: true }))
  await visible('ส่งสลิปแล้ว', coach)
  const payments = state.tables.payments.filter(row => row.team_id === paidTeamId)
  expect(payments.length === 1 && payments[0].status === 'pending' && payments[0].amount === 500 && payments[0].user_id === E2E_COACH, `payments: ${JSON.stringify(payments)}`)
  // AGENTS.md rule 6: the slip is an object path in the private bucket, never a public URL.
  const path = payments[0].slip_url
  expect(typeof path === 'string' && !/^https?:/i.test(path) && state.storage.some(file => file.bucket === 'slips' && file.path === path && file.owner === E2E_COACH), `slip_url ${path}, storage ${JSON.stringify(state.storage)}`)
})

await step('a second slip for the same team is refused', async () => {
  const answer = await postFrom(coach, `/api/teams/${paidTeamId}/payment`, { name: 'again.png', type: 'image/png', bytes: [137, 80, 78, 71] })
  expect(answer.status === 409 && answer.body?.error === 'ทีมนี้มีรายการชำระเงินอยู่แล้ว', `the app answered ${JSON.stringify(answer)}`)
  expect(state.tables.payments.length === 1 && state.storage.length === 1, 'a second slip was stored')
})

const organizer = await h.signedIn(E2E_ORGANIZER)
// The organizer's queue card for a team: the innermost block holding the team's name and its
// reject button (every waiting team has one, whatever else it shows).
const queueCard = name => organizer.locator('div').filter({ has: organizer.getByText(name, { exact: true }) }).filter({ has: organizer.getByRole('button', { name: 'ปฏิเสธ' }) }).last()
// The slip route as a given account sees it: the status, and where a redirect points.
const slipFor = async (tab, paymentId) => {
  const response = await tab.request.get(`${h.BASE}/api/payments/${paymentId}/slip`, { maxRedirects: 0 })
  return { status: response.status(), location: response.headers().location ?? null }
}
let paymentId = ''

await step('the organizer sees both teams waiting, the paid one with its amount and slip', async () => {
  await go('/dashboard', organizer)
  await visible(TEAM_NAME, organizer)
  await visible(PAID_TEAM, organizer)
  paymentId = state.tables.payments[0].id
  const free = (await queueCard(TEAM_NAME).innerText()).replace(/\s+/g, ' ')
  const paid = (await queueCard(PAID_TEAM).innerText()).replace(/\s+/g, ' ')
  expect(!free.includes('หลักฐานการชำระเงิน') && /ยืนยัน/.test(free), `free team card says: ${free}`)
  expect(paid.includes('฿500') && paid.includes('รอตรวจสอบ') && paid.includes('ยืนยันทีมและการชำระ'), `paid team card says: ${paid}`)
  // The slip image loads through the private route, not a public URL.
  const image = queueCard(PAID_TEAM).locator(`img[src="/api/payments/${paymentId}/slip"]`)
  await image.waitFor({ timeout: 10000 })
  await organizer.waitForFunction(src => [...document.images].some(img => img.getAttribute('src') === src && img.complete && img.naturalWidth > 0), `/api/payments/${paymentId}/slip`, { timeout: 10000 })
  await audit('/dashboard (organizer queue)', organizer)
})

await step('the slip opens for the organizer and the payer only, through a short signed URL', async () => {
  const athlete = await h.signedIn(E2E_ATHLETE)
  const guardian = await h.signedIn(E2E_GUARDIAN)
  const [forOrganizer, forCoach, forAthlete, forGuardian] = await Promise.all([organizer, coach, athlete, guardian].map(tab => slipFor(tab, paymentId)))
  const path = state.tables.payments[0].slip_url
  for (const [who, answer] of [['organizer', forOrganizer], ['coach', forCoach]]) {
    expect(answer.status === 307 && answer.location?.includes('/storage/v1/object/sign/slips/') && answer.location.includes('token='), `${who}: ${JSON.stringify(answer)}`)
  }
  for (const [who, answer] of [['athlete', forAthlete], ['guardian', forGuardian]]) expect(answer.status === 403, `${who}: ${JSON.stringify(answer)}`)
  // AGENTS.md rule 6: 60 seconds, for this file only.
  const signed = state.signedUrls.filter(item => item.path === path)
  expect(signed.length >= 2 && signed.every(item => item.expiresAt - Date.now() <= 60000), `signed: ${JSON.stringify(signed.map(item => ({ path: item.path, by: item.by, expiresAt: item.expiresAt })))}`)
  const file = await organizer.request.get(forOrganizer.location)
  expect(file.status() === 200 && (await file.body()).equals(PNG), `the signed URL served ${file.status()}`)
  await athlete.context().close()
  await guardian.context().close()
})

await step('the coach who paid cannot confirm their own payment', async () => {
  const answer = await postFrom(coach, `/api/payments/${paymentId}/confirm`)
  expect(answer.status === 403, `the app answered ${JSON.stringify(answer)}`)
  expect(state.tables.payments[0].status === 'pending' && state.tables.teams.find(row => row.id === paidTeamId)?.status === 'pending', 'the payment or team changed')
})

await step('one tap confirms the payment and the team, and a second call changes nothing', async () => {
  await tap(queueCard(PAID_TEAM).getByRole('button', { name: /ยืนยันทีมและการชำระ/ }))
  for (let waited = 0; state.tables.payments[0].status !== 'confirmed' && waited < 10000; waited += 100) await organizer.waitForTimeout(100)
  expect(state.tables.payments[0].status === 'confirmed' && state.tables.teams.find(row => row.id === paidTeamId)?.status === 'confirmed', `payment ${state.tables.payments[0].status}, team ${state.tables.teams.find(row => row.id === paidTeamId)?.status}`)
  await organizer.getByText(PAID_TEAM).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  expect(await queueCard(PAID_TEAM).count() === 0, 'the paid team is still in the queue')
  const writes = state.writes.length
  const again = await postFrom(organizer, `/api/payments/${paymentId}/confirm`)
  expect(again.status === 200 && state.writes.length === writes && state.tables.payments.length === 1, `again: ${JSON.stringify(again)}, writes ${writes} → ${state.writes.length}`)
})

await step('the free team is confirmed with its own button, which another account cannot use', async () => {
  const refused = await postFrom(coach, `/api/teams/${teamId}/status`, null, { status: 'confirmed' })
  expect(refused.status === 403 && state.tables.teams.find(row => row.id === teamId)?.status === 'pending', `coach: ${JSON.stringify(refused)}`)
  await tap(queueCard(TEAM_NAME).getByRole('button', { name: 'ยืนยัน', exact: true }))
  for (let waited = 0; state.tables.teams.find(row => row.id === teamId)?.status !== 'confirmed' && waited < 10000; waited += 100) await organizer.waitForTimeout(100)
  expect(state.tables.teams.find(row => row.id === teamId)?.status === 'confirmed', `team ${state.tables.teams.find(row => row.id === teamId)?.status}`)
  await organizer.waitForFunction(name => !document.body.innerText.includes(name), TEAM_NAME, { timeout: 10000 })
  await audit('/dashboard (queue empty)', organizer)
})

await h.finish()
