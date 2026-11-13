// A small, stateful stand-in for Supabase (auth + PostgREST) for the browser end-to-end test
// (scripts/e2e/athlete-flow.mjs). It keeps rows in memory, applies the PostgREST filters the
// app uses (eq, neq, is, not.is, lt, lte, gt, gte, in), order, limit and offset, answers HEAD
// counts, single-object reads and inserts, and enforces the unique keys the real tables have
// that the flow can hit (one check-in per enrollment per day, one self-test result per test per
// day). Functions the flow calls are implemented here with the same rules as their SQL. Anything
// else reads as empty. It is a test double: it knows one signed-in user and no RLS.
import http from 'node:http'

export const E2E_USER = '11111111-1111-4111-8111-111111111111'

const bangkokToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

export function createState({ birthDate = '2012-03-04' } = {}) {
  return {
    user: { id: E2E_USER, email: 'e2e-athlete@example.com', aud: 'authenticated', role: 'authenticated' },
    birthDate,
    tables: {
      profiles: [{ id: E2E_USER, full_name: 'ทดสอบ อัตโนมัติ', role: 'player', onboarding_persona: 'athlete' }],
      athlete_profiles: [{ user_id: E2E_USER, display_name: 'ทดสอบ อัตโนมัติ', position: 'MF', province: 'กรุงเทพมหานคร', is_public: false, verification_level: 'self' }],
      training_enrollments: [],
      training_checkins: [],
      athlete_training_goals: [],
      athlete_self_tests: [],
    },
    writes: [],
  }
}

const UNIQUE = {
  training_checkins: ['enrollment_id', 'session_date'],
  training_enrollments: ['athlete_id', 'program_id', 'status'],
  athlete_self_tests: ['athlete_id', 'test_key', 'test_date'],
}

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
    default: return true
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function query(rows, params) {
  let out = rows.filter(row => [...params.entries()].every(([key, raw]) => RESERVED.has(key) || matches(row, key, raw)))
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

const uuid = () => crypto.randomUUID()

function rpc(state, name, body) {
  const me = state.user.id
  const today = bangkokToday()
  const t = state.tables
  switch (name) {
    case 'my_profile_home': return { status: 404, body: { code: 'PGRST202', message: 'not in the test double' } }
    case 'my_team_memberships': return { status: 404, body: { code: 'PGRST202' } }
    case 'my_team_hub': return { status: 404, body: { code: 'PGRST202' } }
    case 'my_athlete_private': return { status: 200, body: [{ birth_date: state.birthDate, guardian_consent_at: '2026-01-01T00:00:00Z' }] }
    case 'public_athlete_age': return { status: 200, body: null }
    case 'set_my_training_goal': {
      const current = t.athlete_training_goals.find(row => row.athlete_id === me && row.ended_at == null)
      if (current?.goal_key === body.p_goal) return { status: 200, body: body.p_goal }
      const stamp = new Date().toISOString()
      if (current) current.ended_at = stamp
      t.athlete_training_goals.push({ id: uuid(), athlete_id: me, goal_key: body.p_goal, started_at: stamp, ended_at: null })
      state.writes.push(`goal:${body.p_goal}`)
      return { status: 200, body: body.p_goal }
    }
    case 'record_my_self_test': {
      const row = t.athlete_self_tests.find(item => item.athlete_id === me && item.test_key === body.p_test && item.test_date === today)
      if (row) row.value = body.p_value
      else t.athlete_self_tests.push({ id: uuid(), athlete_id: me, test_key: body.p_test, value: body.p_value, test_date: today })
      state.writes.push(`self_test:${body.p_test}=${body.p_value}`)
      return { status: 200, body: today }
    }
    case 'delete_my_self_test': {
      const before = t.athlete_self_tests.length
      t.athlete_self_tests = t.athlete_self_tests.filter(item => !(item.athlete_id === me && item.test_key === body.p_test && item.test_date === body.p_date))
      state.writes.push(`delete_self_test:${body.p_test}`)
      return { status: 200, body: before - t.athlete_self_tests.length }
    }
    default: return { status: 200, body: null }
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
    if (url.pathname === '/auth/v1/user') return send(res, 200, state.user)
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const result = rpc(state, url.pathname.slice('/rest/v1/rpc/'.length), body)
      return send(res, result.status, result.body)
    }
    if (!url.pathname.startsWith('/rest/v1/')) return send(res, 404, { message: 'not found' })
    const table = url.pathname.slice('/rest/v1/'.length)
    const rows = state.tables[table] ?? []
    const single = (req.headers.accept || '').includes('vnd.pgrst.object')
    if (req.method === 'POST') {
      const items = (Array.isArray(body) ? body : [body]).map(item => ({ id: uuid(), created_at: new Date().toISOString(), status: table === 'training_enrollments' ? 'active' : undefined, ...item }))
      const unique = UNIQUE[table]
      for (const item of items) {
        if (unique && rows.some(row => unique.every(key => row[key] === item[key]))) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' })
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
