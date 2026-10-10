// QA: a local stand-in for Supabase with a signed-in user per role, so the role pages
// (/team-members, /guardian, /dashboard, /dashboard/results, /match-plan, /training) and the
// public athlete page /players/p-1 can be
// screenshotted without Staging. Never point it at a real project. Results from it are
// "local mock", not Staging.
//
//   node scripts/qa/role-pages-mock.mjs      # listens on 127.0.0.1:54322
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54322 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test npm run build
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54322 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test npx next start -p 3072
//
// Sign in as a role by setting the cookie `sb-127-auth-token` to `qaSessionCookie(role)`
// below (athlete, guardian, coach, organizer). Tables answer with a few rows each; anything
// not listed answers with an empty list, which is how a new account looks.
import http from 'node:http'

const USERS = {
  athlete: { id: 'u-athlete', persona: 'athlete', role: 'user' },
  guardian: { id: 'u-guardian', persona: 'guardian', role: 'user' },
  coach: { id: 'u-coach', persona: 'coach_organizer', role: 'user' },
  organizer: { id: 'u-organizer', persona: 'coach_organizer', role: 'organizer' },
}

export function qaSessionCookie(role) {
  const user = { id: USERS[role].id, aud: 'authenticated', role: 'authenticated', email: `${role}@example.com`, app_metadata: {}, user_metadata: {} }
  const session = { access_token: `qa-${role}`, refresh_token: `qa-${role}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
}

const tournament = { id: 't-1', name: 'BallDoenSai ทดสอบรอบแรก', organizer_id: 'u-organizer', location: 'สนามกีฬากลาง ขอนแก่น', start_date: '2026-10-24', end_date: '2026-10-24', fee: 0, status: 'open', sport: 'football', season: '2026', max_teams: 8 }
const teams = [
  { id: '7e57a000-0000-4000-8000-000000000001', name: 'ขอนแก่น U13', tournament_id: 't-1', status: 'pending', members: '', created_by: 'u-coach', created_at: '2026-10-09', tournaments: { name: tournament.name, organizer_id: 'u-organizer', fee: 0 } },
  { id: 'team-2', name: 'โคราช U13', tournament_id: 't-1', status: 'pending', members: '', created_by: 'u-other', created_at: '2026-10-09', tournaments: { name: tournament.name, organizer_id: 'u-organizer', fee: 0 } },
]

// One public athlete for /players/p-1: a rank row, this season's verified numbers and the
// rating events behind them (form and match-by-match tabs). PAC and DEF are not assessed.
const athlete = { user_id: 'u-athlete', display_name: 'ด.ช. ทดสอบ ใจสู้', position: 'FW', province: 'ขอนแก่น', height_cm: 152, weight_kg: 41, current_team: 'ขอนแก่น U13', bio: null, profile_image_url: null, verification_level: 'performance_verified' }
const rank = { id: 'p-1', player_id: 'u-athlete', player_name: athlete.display_name, team: athlete.current_team, province: 'ขอนแก่น', position: 'FW', sport: 'football', season: '2026', ovr: 68, pts: 1046, pac: null, sho: 71, pas: 64, dri: 69, def: null }
const rating = { id: 'r-1', power_rating: 1046, matches_played: 5, wins: 3, draws: 1, losses: 1, goals: 6, assists: 2, clean_sheets: 0, mvps: 1 }
const ratingEvents = [
  { created_at: '2026-10-24T10:30:00Z', result: 'win', rating_after: 1046, rating_change: 18, goals: 2, assists: 1, mvp: true, clean_sheet: false },
  { created_at: '2026-10-24T08:30:00Z', result: 'loss', rating_after: 1028, rating_change: -14, goals: 0, assists: 0, mvp: false, clean_sheet: false },
  { created_at: '2026-10-17T10:00:00Z', result: 'win', rating_after: 1042, rating_change: 21, goals: 3, assists: 0, mvp: false, clean_sheet: false },
  { created_at: '2026-10-10T10:00:00Z', result: 'draw', rating_after: 1021, rating_change: 2, goals: 0, assists: 1, mvp: false, clean_sheet: false },
  { created_at: '2026-10-03T10:00:00Z', result: 'win', rating_after: 1019, rating_change: 19, goals: 1, assists: 0, mvp: false, clean_sheet: false },
]

http.createServer((request, response) => {
  request.resume()
  request.on('end', () => {
    // The browser reads too (the bottom bar's role and unread count), so answer CORS.
    const cors = { 'access-control-allow-origin': request.headers.origin ?? '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': request.headers['access-control-request-headers'] ?? '*', 'access-control-allow-methods': 'GET,POST,PATCH,HEAD,OPTIONS', 'access-control-expose-headers': 'content-range' }
    if (request.method === 'OPTIONS') { response.writeHead(204, cors); return response.end() }
    const url = new URL(request.url, 'http://mock')
    const token = (request.headers.authorization ?? '').replace('Bearer ', '')
    const role = token.startsWith('qa-') ? token.slice(3) : null
    const me = role ? USERS[role] : null
    const one = (request.headers.accept ?? '').includes('vnd.pgrst.object')
    const send = (status, json, extra = {}) => { response.writeHead(status, { 'content-type': 'application/json', 'content-range': '0-0/0', ...cors, ...extra }); response.end(request.method === 'HEAD' ? '' : JSON.stringify(json)) }
    const rows = list => one ? (list[0] ? send(200, list[0]) : send(406, { code: 'PGRST116', message: '0 rows' })) : send(200, list, { 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` })

    if (url.pathname.startsWith('/auth/v1/user')) {
      return me ? send(200, { id: me.id, aud: 'authenticated', role: 'authenticated', email: `${role}@example.com`, app_metadata: {}, user_metadata: {} }) : send(401, { code: 401, msg: 'no session' })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (table === 'profiles') return rows(me ? [{ id: me.id, role: me.role, onboarding_persona: me.persona, onboarding_completed_at: '2026-10-01', full_name: 'ผู้ทดสอบ' }] : [])
    if (table === 'tournaments') return rows([tournament])
    if (table === 'player_ranks') return rows([rank])
    if (table === 'player_ratings') return rows([rating])
    if (table === 'rating_events') return rows(ratingEvents)
    if (table === 'athlete_profiles') return rows([athlete])
    // The coach's pitch board: an empty plan and four players who accepted the invite.
    if (table === 'rpc/get_match_plan_safely') return send(200, { plan: null, roster: ['ด.ช. ก้อง ใจดี', 'ด.ช. บอส รักบอล', 'ด.ญ. ฟ้า ใสใจ', 'ด.ช. ต้น กล้าหาญ'].map((name, index) => ({ athlete_id: `a${index + 1}aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, display_name: name, profile_position: ['GK', 'DF', 'MF', 'FW'][index], lineup_role: null, position: null, slot_order: null })) })
    // QA_COACH_NO_TEAM=1: a coach who has not entered a team yet (the draft board).
    // The coach's accepted members, for /team-members/[teamId] (stats and team sheet).
    if (table === 'team_members' && role === 'coach') return rows([
      { id: 'tm-1', team_id: teams[0].id, athlete_id: 'u-athlete', status: 'accepted', invited_at: '2026-10-09', athlete_profiles: { display_name: athlete.display_name, position: 'FW' } },
      { id: 'tm-2', team_id: teams[0].id, athlete_id: 'u-keeper', status: 'accepted', invited_at: '2026-10-09', athlete_profiles: { display_name: 'ด.ช. ปาล์ม มือหนึ่ง', position: 'GK' } },
    ])
    // Skill ratings (sql/69): the athlete has one waiting; the coach has none yet.
    if (table === 'coach_skill_assessments') return rows(role === 'athlete' ? [{ id: 'cs-1', athlete_id: 'u-athlete', status: 'pending', created_at: '2026-10-09T08:00:00Z', speed: 75, stamina: null, strength: 60, technique: 70, vision: null, teams: { name: teams[0].name } }] : [])
    // Team events (sql/70): one session the day after tomorrow, one yesterday already checked.
    const soon = new Date(Date.now() + 2 * 86400000).toISOString(), yesterday = new Date(Date.now() - 86400000).toISOString()
    if (table === 'team_events') return rows(role === 'coach' ? [
      { id: 'e0000000-0000-4000-8000-000000000001', kind: 'training', title: 'ซ้อมเย็นวันพุธ', starts_at: soon, location: 'สนามโรงเรียนบ้านโนน', cancelled_at: null },
      { id: 'e0000000-0000-4000-8000-000000000002', kind: 'training', title: 'ซ้อมทีม', starts_at: yesterday, location: null, cancelled_at: null },
    ] : [])
    if (table === 'team_event_responses') return rows(role === 'coach' ? [{ event_id: 'e0000000-0000-4000-8000-000000000001', athlete_id: 'u-athlete', answer: 'yes' }] : [])
    if (table === 'team_event_attendance') return rows(role === 'coach' ? [
      { event_id: 'e0000000-0000-4000-8000-000000000002', athlete_id: 'u-athlete', present: true },
      { event_id: 'e0000000-0000-4000-8000-000000000002', athlete_id: 'u-keeper', present: false },
    ] : [])
    if (table === 'rpc/my_upcoming_team_events') return send(200, role === 'athlete' || role === 'guardian' ? [
      { event_id: 'e0000000-0000-4000-8000-000000000001', team_id: teams[0].id, team_name: teams[0].name, kind: 'training', title: 'ซ้อมเย็นวันพุธ', starts_at: soon, location: 'สนามโรงเรียนบ้านโนน', note: null, athlete_id: 'u-athlete', athlete_name: athlete.display_name, answer: role === 'athlete' ? 'yes' : null },
    ] : [])
    // Team announcements (sql/71): the coach sent one (2 of 3 read); athlete and guardian have one unread.
    if (table === 'team_announcements') return rows(role === 'coach' ? [{ id: 'a0000000-0000-4000-8000-000000000001', body: 'เลื่อนซ้อมวันพุธเป็น 5 โมงเย็น ใส่ชุดสีแดงนะครับ', created_at: '2026-10-10T09:00:00Z', to_athletes: true, to_guardians: true }] : [])
    if (table === 'team_announcement_recipients') return rows(role === 'coach' ? [{ announcement_id: 'a0000000-0000-4000-8000-000000000001', read_at: '2026-10-10T10:00:00Z' }, { announcement_id: 'a0000000-0000-4000-8000-000000000001', read_at: '2026-10-10T11:00:00Z' }, { announcement_id: 'a0000000-0000-4000-8000-000000000001', read_at: null }] : [])
    if (table === 'rpc/my_team_announcements') return send(200, role === 'athlete' || role === 'guardian' ? [
      { id: 'a0000000-0000-4000-8000-000000000001', team_name: teams[0].name, body: 'เลื่อนซ้อมวันพุธเป็น 5 โมงเย็น ใส่ชุดสีแดงนะครับ', created_at: '2026-10-10T09:00:00Z', read_at: null },
    ] : [])
    if (table === 'rpc/mark_team_announcements_read') { console.log('mark read', role); return send(200, 1) }
    // Team training plan (sql/72): this Bangkok week, today plus Thursday.
    const bangkok = new Date(Date.now() + 7 * 3600000), weekday = (bangkok.getUTCDay() + 6) % 7
    const weekStart = new Date(bangkok.getTime() - weekday * 86400000).toISOString().slice(0, 10)
    const planDays = [...new Set([weekday, 3])].sort().map(day => ({ day, title: day === 3 ? 'เกมเล็ก' : 'บอลติดเท้า', blocks: [
      { drill: 'a1-react-jog', name: 'วิ่งเหยาะ หยุดและเปลี่ยนทิศตามสัญญาณ', minutes: 10, load: 1 },
      { drill: null, name: 'เลี้ยงบอลผ่านกรวย', minutes: 15, load: 2 },
      { drill: null, name: 'เกมเล็ก 5 ต่อ 5', minutes: 25, load: 3 },
    ] }))
    if (table === 'team_training_plans') return rows(role === 'coach' ? [{ week_start: weekStart, days: planDays }] : [])
    if (table === 'rpc/my_team_training_plans') return send(200, role === 'athlete' || role === 'guardian' ? [{ team_id: teams[0].id, team_name: teams[0].name, week_start: weekStart, days: planDays }] : [])
    if (table === 'teams') return rows(role === 'coach' ? (process.env.QA_COACH_NO_TEAM ? [] : teams.slice(0, 1)) : role === 'organizer' ? teams : [])
    send(200, [])
  })
}).listen(54322, '127.0.0.1', () => console.log('role pages mock on http://127.0.0.1:54322'))
