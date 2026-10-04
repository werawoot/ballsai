// QA: a local stand-in for Supabase so /tournaments/[id]/fixtures can be tested without
// Staging. Never point it at a real project. Results from it are "local mock", not Staging.
//
//   node scripts/qa/fixtures-mock.mjs        # listens on 127.0.0.1:54321
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test npm run build
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test npx next start -p 3071
//
// Tournament ids: t-groups (2 groups + knockout, half played), t-knock (8-team knockout,
// round 1 played, one draw decided on penalties), t-big (64-team league, 2,016 fixtures),
// t-empty (not published), t-missing (sql/57 not applied), t-fail (server error).
// The draws come from lib/fixtures.ts itself, so they have the shape the app stores.
import http from 'node:http'

const { groupStageFixtures, knockoutFixtures, leagueFixtures, toFixtureRows } = await import('../../lib/fixtures.ts')

// Long Thai names on purpose: they are what overflows and clips first.
const THAI = ['สโมสรฟุตบอลเยาวชนเทศบาลนครเชียงใหม่ ยู-15', 'ร.ร.อัสสัมชัญศรีราชา', 'บุรีรัมย์ ยูไนเต็ด อะคาเดมี่', 'ทีมน้องๆ ฟุตบอลบ้านหนองบัวลำภู', 'ชลบุรี เอฟซี', 'อุดรธานี จูเนียร์', 'ภูเก็ต ซิตี้ ยู-13', 'ศรีสะเกษ ยังสตาร์']
const teams = (prefix, count) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}`, name: THAI[index % THAI.length] + (index >= THAI.length ? ` ${index + 1}` : '') }))

// The row shape of public_tournament_fixtures (sql/57).
function publicRows(rows, entrants, scores, winners = {}) {
  const byId = new Map(entrants.map((team, index) => [team.id, { name: team.name, order: index }]))
  return rows.map(row => ({
    fixture_key: row.key, stage: row.stage, round: row.round, group_label: row.group_label,
    home_team_id: row.home_team_id, away_team_id: row.away_team_id,
    home_name: byId.get(row.home_team_id)?.name ?? null, away_name: byId.get(row.away_team_id)?.name ?? null,
    home_source: row.home_source, away_source: row.away_source,
    home_score: scores[row.key]?.[0] ?? null, away_score: scores[row.key]?.[1] ?? null,
    winner_team_id: winners[row.key] ?? null,
    home_order: byId.get(row.home_team_id)?.order ?? null, away_order: byId.get(row.away_team_id)?.order ?? null,
  }))
}

const data = {}
{
  const entrants = teams('g', 8)
  const rows = toFixtureRows(groupStageFixtures(entrants.map(team => team.id), { groupCount: 2, advancePerGroup: 2 }).fixtures)
  const scores = {}
  rows.filter(row => row.stage === 'group').slice(0, 7).forEach((row, index) => { scores[row.key] = [index % 3, (index + 1) % 2] })
  data['t-groups'] = {
    heading: { name: 'ศึกฟุตบอลเยาวชนชิงถ้วยพระราชทาน รุ่นอายุไม่เกิน 15 ปี ประจำปี 2569', location: 'สนามกีฬากลางจังหวัดขอนแก่น', start_date: '2026-10-10', end_date: '2026-10-25' },
    rows: publicRows(rows, entrants, scores),
  }
}
{
  const entrants = teams('k', 8)
  const rows = toFixtureRows(knockoutFixtures(entrants.map(team => ({ kind: 'team', teamId: team.id }))))
  const scores = {}, winners = {}
  rows.filter(row => row.round === 1).forEach((row, index) => {
    scores[row.key] = index === 0 ? [1, 1] : [2, 0]
    winners[row.key] = index === 0 ? row.away_team_id : row.home_team_id
  })
  data['t-knock'] = { heading: { name: 'Knockout Cup', location: null, start_date: '2026-11-01', end_date: null }, rows: publicRows(rows, entrants, scores, winners) }
}
{
  const entrants = teams('l', 64)
  const rows = toFixtureRows(leagueFixtures(entrants.map(team => team.id)))
  const scores = {}
  rows.slice(0, 1000).forEach((row, index) => { scores[row.key] = [index % 4, index % 3] })
  data['t-big'] = { heading: { name: 'Big League', location: 'Bangkok', start_date: '2026-09-01', end_date: '2027-03-01' }, rows: publicRows(rows, entrants, scores) }
}
data['t-empty'] = { heading: { name: 'ยังไม่จับสลาก', location: 'ลำปาง', start_date: '2026-12-01', end_date: null }, rows: [] }
data['t-missing'] = { error: [404, { code: 'PGRST202', message: 'Could not find the function public.public_tournament_fixtures' }] }
data['t-fail'] = { error: [500, { code: 'XX000', message: 'mock failure' }] }

http.createServer((request, response) => {
  let body = ''
  request.on('data', chunk => { body += chunk })
  request.on('end', () => {
    const url = new URL(request.url, 'http://mock')
    const send = (status, json) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(json)) }
    if (url.pathname === '/rest/v1/rpc/public_tournament_fixtures') {
      const entry = data[JSON.parse(body || '{}').p_tournament_id]
      return entry?.error ? send(...entry.error) : send(200, entry?.rows ?? [])
    }
    if (url.pathname === '/rest/v1/tournaments') {
      const heading = data[(url.searchParams.get('id') ?? '').replace('eq.', '')]?.heading
      if ((request.headers.accept ?? '').includes('vnd.pgrst.object')) return heading ? send(200, heading) : send(406, { code: 'PGRST116', message: '0 rows' })
      return send(200, heading ? [heading] : [])
    }
    // Signed out: every visitor of a public page.
    if (url.pathname.startsWith('/auth/v1/user')) return send(401, { code: 401, msg: 'no session' })
    send(200, [])
  })
}).listen(54321, '127.0.0.1', () => console.log('fixtures mock on http://127.0.0.1:54321'))
