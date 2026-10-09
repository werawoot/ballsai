// QA: a local stand-in for Supabase with a signed-in user per role, so the role pages
// (/team-members, /guardian, /dashboard, /dashboard/results, /match-plan, /training) can be
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
  { id: 'team-1', name: 'ขอนแก่น U13', tournament_id: 't-1', status: 'pending', members: '', created_by: 'u-coach', created_at: '2026-10-09', tournaments: { name: tournament.name, organizer_id: 'u-organizer', fee: 0 } },
  { id: 'team-2', name: 'โคราช U13', tournament_id: 't-1', status: 'pending', members: '', created_by: 'u-other', created_at: '2026-10-09', tournaments: { name: tournament.name, organizer_id: 'u-organizer', fee: 0 } },
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
    if (table === 'teams') return rows(role === 'coach' ? teams.slice(0, 1) : role === 'organizer' ? teams : [])
    send(200, [])
  })
}).listen(54322, '127.0.0.1', () => console.log('role pages mock on http://127.0.0.1:54322'))
