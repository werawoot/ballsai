// A small, stateful stand-in for Supabase (auth + PostgREST) for the browser end-to-end test
// (scripts/e2e/athlete-flow.mjs). It keeps rows in memory, applies the PostgREST filters the
// app uses (eq, neq, is, lt, lte, gt, gte, in, not.<op>), order, limit and offset, answers HEAD
// counts, single-object reads and inserts, and enforces the unique keys of the real tables that
// the flow can hit (sql/63: one active enrollment per athlete and programme, one check-in per
// enrollment per day; sql/96: one self-test result per test per day).
//
// The functions the flow calls check what their SQL checks (sql/95 set_my_training_goal, sql/96
// record_my_self_test and delete_my_self_test) and raise the same error codes. Locks and RLS are
// not modelled: the caller is whoever the bearer token names, and every row is visible.
//
// Anything it does not know (a table, a function, a filter operator) is answered with 501 and
// recorded in state.unknown, so the test fails instead of passing on an empty answer. The
// tables in EMPTY_BY_DESIGN are ones the pages read that this flow has no rows for.
import http from 'node:http'

export const E2E_ATHLETE = '11111111-1111-4111-8111-111111111111'
export const E2E_GUARDIAN = '22222222-2222-4222-8222-222222222222'

export const bangkokToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

const TABLES = ['profiles', 'athlete_profiles', 'guardian_links', 'training_enrollments', 'training_checkins', 'athlete_training_goals', 'athlete_self_tests']
// Read by the bottom bar (notifications), the training pages (team_members) and the athlete
// home's fallback reads (app/profile/page.tsx); this athlete has no rows in any of them.
const EMPTY_BY_DESIGN = new Set(['notifications', 'team_members', 'player_ranks', 'tournaments', 'match_results', 'athlete_highlights', 'athlete_videos', 'athlete_progress', 'player_ratings', 'athlete_xp_events'])

export function createState({ athleteBirthDate = '2012-03-04' } = {}) {
  const users = {
    [E2E_ATHLETE]: { id: E2E_ATHLETE, email: 'e2e-athlete@example.com', aud: 'authenticated', role: 'authenticated' },
    [E2E_GUARDIAN]: { id: E2E_GUARDIAN, email: 'e2e-guardian@example.com', aud: 'authenticated', role: 'authenticated' },
  }
  return {
    users,
    tables: {
      profiles: [
        { id: E2E_ATHLETE, full_name: 'ทดสอบ อัตโนมัติ', role: 'player', onboarding_persona: 'athlete' },
        { id: E2E_GUARDIAN, full_name: 'ผู้ปกครอง ทดสอบ', role: 'player', onboarding_persona: 'guardian' },
      ],
      athlete_profiles: [{ user_id: E2E_ATHLETE, display_name: 'ทดสอบ อัตโนมัติ', position: 'MF', province: 'กรุงเทพมหานคร', is_public: false, verification_level: 'self', birth_date: athleteBirthDate, guardian_consent_at: '2026-01-01T00:00:00Z' }],
      // The embedded athlete_profiles object stands in for PostgREST's resource embedding.
      guardian_links: [{ id: 'gl-1', guardian_id: E2E_GUARDIAN, athlete_id: E2E_ATHLETE, status: 'accepted', consent_at: '2026-01-01T00:00:00Z', athlete_profiles: { display_name: 'ทดสอบ อัตโนมัติ' } }],
      training_enrollments: [],
      training_checkins: [],
      athlete_training_goals: [],
      athlete_self_tests: [],
    },
    writes: [],
    unknown: [],
  }
}

// A row conflicts when every key matches and, for a partial index, the row is inside it.
const UNIQUE = {
  training_enrollments: { keys: ['athlete_id', 'program_id'], where: row => row.status === 'active' },
  training_checkins: { keys: ['enrollment_id', 'session_date'] },
  athlete_self_tests: { keys: ['athlete_id', 'test_key', 'test_date'] },
}

const OPERATORS = new Set(['eq', 'neq', 'is', 'lt', 'lte', 'gt', 'gte', 'in', 'not'])

function matches(row, key, raw) {
  const value = row[key]
  const [op, ...rest] = raw.split('.')
  const arg = rest.join('.')
  switch (op) {
    case 'eq': return String(value) === arg
    case 'neq': return String(value) !== arg
    case 'is': return arg === 'null' ? value == null : String(value) === arg
    case 'lt': return value != null && String(value) < arg
    case 'lte': return value != null && String(value) <= arg
    case 'gt': return value != null && String(value) > arg
    case 'gte': return value != null && String(value) >= arg
    case 'in': return arg.replace(/^\(|\)$/g, '').split(',').map(item => item.replace(/^"|"$/g, '')).includes(String(value))
    case 'not': return !matches(row, key, arg)
  }
}

const QUERY_PARAMS = new Set(['select', 'order', 'limit', 'offset'])

// The filter operators of a request that the mock cannot apply, or [] when it can apply all.
function unsupported(params) {
  return [...params.entries()].filter(([key, raw]) => !QUERY_PARAMS.has(key) && (!OPERATORS.has(raw.split('.')[0]) || (raw.startsWith('not.') && !OPERATORS.has(raw.split('.')[1])))).map(([key, raw]) => `${key}=${raw}`)
}

function query(rows, params) {
  let out = rows.filter(row => [...params.entries()].every(([key, raw]) => QUERY_PARAMS.has(key) || matches(row, key, raw)))
  const order = params.get('order')
  if (order) {
    const keys = order.split(',').map(part => { const [key, dir] = part.split('.'); return { key, desc: dir === 'desc' } })
    out = [...out].sort((a, b) => {
      for (const { key, desc } of keys) {
        const left = a[key] ?? ''; const right = b[key] ?? ''
        if (left < right) return desc ? 1 : -1
        if (left > right) return desc ? -1 : 1
      }
      return 0
    })
  }
  const offset = Number(params.get('offset') || 0)
  const limit = params.has('limit') ? Number(params.get('limit')) : Infinity
  return { total: out.length, rows: out.slice(offset, offset + limit) }
}

const raise = (status, code, message) => ({ status, body: { code, message, details: null, hint: null } })
const SELF_TEST_RANGES = { juggling: [0, 1000], plank: [0, 120], long_jump: [10, 400] }

function yearsBefore(day, years) {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y - years, m - 1, d))
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0) // 29 Feb → 28 Feb, as Postgres does
  return date.toISOString().slice(0, 10)
}

function rpc(state, me, name, body) {
  const today = bangkokToday()
  const t = state.tables
  const athlete = t.athlete_profiles.find(row => row.user_id === me)
  switch (name) {
    // The home and hub functions are left out on purpose: the app's fallback reads run instead.
    case 'my_profile_home': case 'my_team_memberships': case 'my_team_hub':
      return raise(404, 'PGRST202', `Could not find the function public.${name}`)
    // The age shown on a public profile; this athlete's profile is not public.
    case 'public_athlete_age': return { status: 200, body: null }
    case 'my_athlete_private':
      return { status: 200, body: athlete ? [{ birth_date: athlete.birth_date ?? null, guardian_consent_at: athlete.guardian_consent_at ?? null }] : [] }
    case 'set_my_training_goal': {
      if (!me) return raise(401, '42501', 'TRAINING_GOAL_AUTH')
      if (!['ball_control', 'strength', 'speed', 'consistency'].includes(body.p_goal)) return raise(400, '22023', 'TRAINING_GOAL_UNKNOWN')
      if (!athlete) return raise(403, '42501', 'TRAINING_GOAL_NO_ATHLETE')
      const current = t.athlete_training_goals.find(row => row.athlete_id === me && row.ended_at == null)
      if (current?.goal_key === body.p_goal) return { status: 200, body: body.p_goal }
      const stamp = new Date().toISOString()
      if (current) current.ended_at = stamp
      t.athlete_training_goals.push({ id: crypto.randomUUID(), athlete_id: me, goal_key: body.p_goal, started_at: stamp, ended_at: null })
      state.writes.push(`goal:${body.p_goal}`)
      return { status: 200, body: body.p_goal }
    }
    case 'record_my_self_test': {
      if (!me) return raise(401, '42501', 'SELF_TEST_AUTH')
      const range = SELF_TEST_RANGES[body.p_test]
      if (!range) return raise(400, '22023', 'SELF_TEST_UNKNOWN')
      if (!Number.isInteger(body.p_value) || body.p_value < range[0] || body.p_value > range[1]) return raise(400, '22023', 'SELF_TEST_VALUE')
      if (!athlete) return raise(403, '42501', 'SELF_TEST_NO_ATHLETE')
      if (body.p_test === 'long_jump' && (!athlete.birth_date || athlete.birth_date > yearsBefore(today, 12))) return raise(403, '42501', 'SELF_TEST_AGE')
      const row = t.athlete_self_tests.find(item => item.athlete_id === me && item.test_key === body.p_test && item.test_date === today)
      if (row) row.value = body.p_value
      else t.athlete_self_tests.push({ id: crypto.randomUUID(), athlete_id: me, test_key: body.p_test, value: body.p_value, test_date: today })
      state.writes.push(`self_test:${body.p_test}=${body.p_value}`)
      return { status: 200, body: today }
    }
    case 'delete_my_self_test': {
      if (!me) return raise(401, '42501', 'SELF_TEST_AUTH')
      if (!SELF_TEST_RANGES[body.p_test] || !body.p_date) return raise(400, '22023', 'SELF_TEST_UNKNOWN')
      const before = t.athlete_self_tests.length
      t.athlete_self_tests = t.athlete_self_tests.filter(item => !(item.athlete_id === me && item.test_key === body.p_test && item.test_date === body.p_date))
      state.writes.push(`delete_self_test:${body.p_test}`)
      return { status: 200, body: before - t.athlete_self_tests.length }
    }
    default:
      state.unknown.push(`rpc ${name}`)
      return raise(501, 'E2E_UNKNOWN', `the test double has no function ${name}`)
  }
}

// The signed-in user named by the request's bearer token (the JWT's sub), or null.
function caller(state, req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  try {
    const sub = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString()).sub
    return state.users[sub] ? sub : null
  } catch {
    return null
  }
}

export function startMock(state, port = 54399) {
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers })
    res.end(body === undefined ? undefined : JSON.stringify(body))
  }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' })
      return res.end()
    }
    const url = new URL(req.url, 'http://mock')
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    const me = caller(state, req)
    if (url.pathname === '/auth/v1/user') return me ? send(res, 200, state.users[me]) : send(res, 401, { message: 'invalid token' })
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const result = rpc(state, me, url.pathname.slice('/rest/v1/rpc/'.length), body)
      return send(res, result.status, result.body)
    }
    if (!url.pathname.startsWith('/rest/v1/')) {
      state.unknown.push(`${req.method} ${url.pathname}`)
      return send(res, 501, { message: 'not in the test double' })
    }
    const table = url.pathname.slice('/rest/v1/'.length)
    const single = (req.headers.accept || '').includes('vnd.pgrst.object')
    if (!TABLES.includes(table)) {
      if (req.method !== 'GET' && req.method !== 'HEAD' || !EMPTY_BY_DESIGN.has(table)) {
        state.unknown.push(`${req.method} ${table}`)
        return send(res, 501, { code: 'E2E_UNKNOWN', message: `the test double has no table ${table}` })
      }
      if (req.method === 'HEAD') { res.writeHead(200, { 'content-range': '*/0', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }); return res.end() }
      return single ? send(res, 406, { code: 'PGRST116', message: 'no rows' }) : send(res, 200, [], { 'content-range': '*/0' })
    }
    const bad = unsupported(url.searchParams)
    if (bad.length) {
      state.unknown.push(`filter ${table}: ${bad.join(', ')}`)
      return send(res, 501, { code: 'E2E_UNKNOWN', message: `the test double cannot apply ${bad.join(', ')}` })
    }
    const rows = state.tables[table]
    if (req.method === 'POST') {
      const items = (Array.isArray(body) ? body : [body]).map(item => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(table === 'training_enrollments' ? { status: 'active' } : {}), ...item }))
      const unique = UNIQUE[table]
      for (const item of items) {
        const inIndex = row => !unique.where || unique.where(row)
        if (unique && inIndex(item) && rows.some(row => inIndex(row) && unique.keys.every(key => row[key] === item[key]))) {
          state.writes.push(`conflict:${table}`)
          return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' })
        }
      }
      state.tables[table] = [...rows, ...items]
      state.writes.push(`insert:${table}`)
      const wantRows = (req.headers.prefer || '').includes('return=representation')
      return send(res, 201, wantRows ? (single ? items[0] : items) : undefined)
    }
    if (req.method === 'PATCH') {
      const { rows: hit } = query(rows, url.searchParams)
      for (const row of hit) Object.assign(row, body)
      state.writes.push(`update:${table}`)
      return send(res, 200, hit)
    }
    if (req.method === 'DELETE') {
      const { rows: hit } = query(rows, url.searchParams)
      state.tables[table] = rows.filter(row => !hit.includes(row))
      state.writes.push(`delete:${table}`)
      return send(res, 200, hit)
    }
    const { total, rows: page } = query(rows, url.searchParams)
    const range = `0-${Math.max(0, page.length - 1)}/${total}`
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-range': range, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }); return res.end() }
    if (single) return page.length ? send(res, 200, page[0]) : send(res, 406, { code: 'PGRST116', message: 'no rows' })
    return send(res, 200, page, { 'content-range': range })
  })
  return new Promise(resolve => server.listen(port, () => resolve(server)))
}
