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
export const E2E_COACH = '44444444-4444-4444-8444-444444444444'

export const bangkokToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

const TABLES = ['profiles', 'tournaments', 'athlete_profiles', 'guardian_links', 'training_enrollments', 'training_checkins', 'athlete_training_goals', 'athlete_self_tests', 'teams', 'team_members', 'team_join_links', 'team_join_requests', 'team_staff']
// Read by the bottom bar (notifications), the training pages (team_members) and the athlete
// home's fallback reads (app/profile/page.tsx); this athlete has no rows in any of them.
const EMPTY_BY_DESIGN = new Set(['coach_attestations', 'coach_skill_assessments', 'coach_athlete_notes', 'team_training_plans', 'team_announcements', 'team_events', 'team_match_minutes', 'team_match_minute_entries', 'notifications', 'player_ranks', 'match_results', 'athlete_highlights', 'athlete_videos', 'athlete_progress', 'player_ratings', 'athlete_xp_events'])

export function createState({ athleteBirthDate = '2012-03-04', tournaments = [] } = {}) {
  const users = {
    [E2E_ATHLETE]: { id: E2E_ATHLETE, email: 'e2e-athlete@example.com', aud: 'authenticated', role: 'authenticated' },
    [E2E_GUARDIAN]: { id: E2E_GUARDIAN, email: 'e2e-guardian@example.com', aud: 'authenticated', role: 'authenticated' },
    [E2E_COACH]: { id: E2E_COACH, email: 'e2e-coach@example.com', aud: 'authenticated', role: 'authenticated' },
  }
  return {
    users,
    tables: {
      profiles: [
        { id: E2E_ATHLETE, full_name: 'ทดสอบ อัตโนมัติ', role: 'player', onboarding_persona: 'athlete' },
        { id: E2E_GUARDIAN, full_name: 'ผู้ปกครอง ทดสอบ', role: 'player', onboarding_persona: 'guardian' },
        { id: E2E_COACH, full_name: 'โค้ช ทดสอบ', role: 'player', onboarding_persona: 'coach_organizer', province: 'เชียงใหม่' },
      ],
      athlete_profiles: [{ user_id: E2E_ATHLETE, display_name: 'ทดสอบ อัตโนมัติ', position: 'MF', province: 'กรุงเทพมหานคร', is_public: false, verification_level: 'self', birth_date: athleteBirthDate, guardian_consent_at: '2026-01-01T00:00:00Z' }],
      // The embedded athlete_profiles object stands in for PostgREST's resource embedding.
      guardian_links: [{ id: 'gl-1', guardian_id: E2E_GUARDIAN, athlete_id: E2E_ATHLETE, status: 'accepted', consent_at: '2026-01-01T00:00:00Z', athlete_profiles: { display_name: 'ทดสอบ อัตโนมัติ' } }],
      training_enrollments: [],
      training_checkins: [],
      athlete_training_goals: [],
      athlete_self_tests: [],
      // Tournaments a flow passes in (registration-flow.mjs); none by default, as before.
      tournaments,
      teams: [],
      team_members: [],
      team_join_links: [],
      team_join_requests: [],
      team_staff: [],
    },
    writes: [],
    unknown: [],
    // Every request, in order, for the failure report of a step: [ms, 'mock', method, path].
    trace: [],
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
    // The coach's own team (sql/78 create_my_team, sql/79 delete_my_team, sql/83 join links and
    // requests, sql/75-76 staff and roster reads). Notifications are not modelled.
    case 'create_my_team': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const name = String(body.p_name ?? '').trim().replace(/\s+/g, ' ')
      if (!body.p_team_id) return raise(400, '22023', 'INVALID_TEAM')
      if (name.length < 2 || name.length > 80) return raise(400, '22023', 'INVALID_TEAM_NAME')
      const existing = t.teams.find(row => row.id === body.p_team_id)
      if (existing) return existing.created_by === me ? { status: 200, body: existing.id } : raise(403, '42501', 'NOT_ALLOWED')
      const profile = t.profiles.find(row => row.id === me)
      if (!['organizer', 'admin'].includes(profile?.role) && profile?.onboarding_persona !== 'coach_organizer') return raise(403, '42501', 'COACH_ORGANIZER_REQUIRED')
      if (t.teams.filter(row => row.created_by === me && row.kind === 'club').length >= 20) return raise(400, '22023', 'TOO_MANY_TEAMS')
      t.teams.push({ id: body.p_team_id, name, members: '', tournament_id: null, created_by: me, status: 'draft', kind: 'club', created_at: new Date().toISOString(), tournaments: null })
      state.writes.push('team:create')
      return { status: 200, body: body.p_team_id }
    }
    case 'my_team_join_link': case 'update_team_join_link': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const team = t.teams.find(row => row.id === body.p_team_id)
      if (!team || team.created_by !== me) return raise(403, '42501', 'NOT_ALLOWED')
      if (team.kind !== 'club') return raise(400, '22023', 'NOT_CLUB_TEAM')
      const newToken = () => crypto.randomUUID().replace(/-/g, '')
      let link = t.team_join_links.find(row => row.team_id === team.id)
      if (!link) { link = { team_id: team.id, token: newToken(), open: true }; t.team_join_links.push(link) }
      if (name === 'update_team_join_link') {
        if (body.p_rotate) link.token = newToken()
        if (typeof body.p_open === 'boolean') link.open = body.p_open
      }
      return { status: 200, body: [{ token: link.token, open: link.open }] }
    }
    case 'team_join_preview': {
      const link = /^[0-9a-f]{32}$/.test(String(body.p_token ?? '')) ? t.team_join_links.find(row => row.token === body.p_token) : null
      const team = link && t.teams.find(row => row.id === link.team_id)
      if (!team) return { status: 200, body: [] }
      const coach = t.profiles.find(row => row.id === team.created_by)
      return { status: 200, body: [{ team_name: team.name, coach_name: coach?.full_name ?? null, province: coach?.province ?? null, open: link.open }] }
    }
    case 'request_to_join_team': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const link = /^[0-9a-f]{32}$/.test(String(body.p_token ?? '')) ? t.team_join_links.find(row => row.token === body.p_token) : null
      if (!link) return raise(400, '22023', 'LINK_NOT_FOUND')
      const team = t.teams.find(row => row.id === link.team_id)
      if (!link.open) return raise(409, '55000', 'LINK_CLOSED')
      if (team.created_by === me) return raise(400, '22023', 'OWN_TEAM')
      if (team.status !== 'draft') return raise(409, '55000', 'ROSTER_LOCKED')
      if (!athlete) return raise(400, '22023', 'ATHLETE_PROFILE_REQUIRED')
      if (!String(athlete.display_name ?? '').trim()) return raise(400, '22023', 'ATHLETE_NAME_REQUIRED')
      const member = t.team_members.find(row => row.team_id === team.id && row.athlete_id === me)
      if (member?.status === 'accepted') return { status: 200, body: 'already_member' }
      if (t.team_join_requests.some(row => row.team_id === team.id && row.athlete_id === me && row.status === 'pending')) return { status: 200, body: 'already_requested' }
      t.team_join_requests.push({ id: crypto.randomUUID(), team_id: team.id, athlete_id: me, status: 'pending', created_at: new Date().toISOString() })
      state.writes.push('join:request')
      return { status: 200, body: 'requested' }
    }
    case 'team_join_requests_for': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      if (!t.teams.some(row => row.id === body.p_team_id && row.created_by === me)) return raise(403, '42501', 'NOT_ALLOWED')
      return { status: 200, body: t.team_join_requests.filter(row => row.team_id === body.p_team_id && row.status === 'pending').map(row => {
        const profile = t.athlete_profiles.find(item => item.user_id === row.athlete_id)
        return { request_id: row.id, display_name: profile?.display_name ?? null, athlete_position: profile?.position ?? null, birth_year: profile?.birth_date ? Number(profile.birth_date.slice(0, 4)) : null, created_at: row.created_at }
      }) }
    }
    case 'decide_join_request': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      if (typeof body.p_accept !== 'boolean') return raise(400, '22023', 'INVALID_DECISION')
      const request = t.team_join_requests.find(row => row.id === body.p_request_id)
      if (!request) return raise(400, '22023', 'REQUEST_NOT_FOUND')
      const team = t.teams.find(row => row.id === request.team_id)
      if (team?.created_by !== me) return raise(403, '42501', 'NOT_ALLOWED')
      if (request.status !== 'pending') return { status: 200, body: request.status }
      if (body.p_accept) {
        if (team.status !== 'draft') return raise(409, '55000', 'ROSTER_LOCKED')
        const member = t.team_members.find(row => row.team_id === team.id && row.athlete_id === request.athlete_id)
        if (member) member.status = 'accepted'
        else t.team_members.push({ id: crypto.randomUUID(), team_id: team.id, athlete_id: request.athlete_id, invited_by: me, status: 'accepted', invited_at: new Date().toISOString(), responded_at: new Date().toISOString() })
      }
      request.status = body.p_accept ? 'accepted' : 'declined'
      state.writes.push(`join:${request.status}`)
      return { status: 200, body: request.status }
    }
    case 'delete_my_team': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const team = t.teams.find(row => row.id === body.p_team_id)
      if (!team) return { status: 200, body: 'already_gone' }
      if (team.created_by !== me) return raise(403, '42501', 'NOT_ALLOWED')
      if (team.status !== 'draft') return raise(409, '55000', 'TEAM_SUBMITTED')
      const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ')
      if (clean(body.p_confirm_name) !== clean(team.name)) return raise(400, '22023', 'TEAM_NAME_MISMATCH')
      for (const table of ['team_members', 'team_join_links', 'team_join_requests', 'team_staff']) t[table] = t[table].filter(row => row.team_id !== team.id)
      t.teams = t.teams.filter(row => row.id !== team.id)
      state.writes.push('team:delete')
      return { status: 200, body: 'deleted' }
    }
    // Entering a tournament (sql/20, sql/99 for submit): the rules the registration flow can meet.
    case 'public_tournament_organizers': return { status: 200, body: [] }
    case 'create_tournament_team_safely': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const name = String(body.p_name ?? '').trim()
      if (name.length < 2 || name.length > 80) return raise(400, '22023', 'INVALID_TEAM_NAME')
      const profile = t.profiles.find(row => row.id === me)
      if (!['organizer', 'admin'].includes(profile?.role) && profile?.onboarding_persona !== 'coach_organizer') return raise(403, '42501', 'COACH_ORGANIZER_REQUIRED')
      const tournament = t.tournaments.find(row => row.id === body.p_tournament_id)
      if (!tournament) return raise(400, 'P0001', 'TOURNAMENT_NOT_FOUND')
      if (tournament.status !== 'open') return raise(400, 'P0001', 'TOURNAMENT_CLOSED')
      if (t.teams.some(row => row.tournament_id === tournament.id && row.created_by === me)) return raise(409, '23505', 'ALREADY_HAS_TEAM_FOR_TOURNAMENT')
      const id = crypto.randomUUID()
      // The embedded tournaments object stands in for PostgREST's embedding (/team-members reads it).
      t.teams.push({ id, name, members: '', tournament_id: tournament.id, created_by: me, status: 'draft', kind: 'entry', created_at: new Date().toISOString(), tournaments: { name: tournament.name, fee: tournament.fee, location: tournament.location ?? null } })
      state.writes.push('team:create-entry')
      return { status: 200, body: id }
    }
    case 'invite_team_member': {
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const team = t.teams.find(row => row.id === body.p_team_id)
      if (!team) return raise(400, 'P0001', 'TEAM_NOT_FOUND')
      const organizer = t.tournaments.find(row => row.id === team.tournament_id)?.organizer_id
      if (!(team.created_by === me || (organizer != null && organizer === me))) return raise(400, 'P0001', 'NOT_ALLOWED')
      if (team.status !== 'draft') return raise(400, 'P0001', 'ROSTER_LOCKED')
      const invitee = Object.values(state.users).find(user => user.email.toLowerCase() === String(body.p_email ?? '').trim().toLowerCase())
      if (!invitee) return raise(400, 'P0001', 'USER_NOT_FOUND')
      if (invitee.id === me) return raise(400, 'P0001', 'CANNOT_INVITE_SELF')
      if (!t.athlete_profiles.some(row => row.user_id === invitee.id)) return raise(400, 'P0001', 'ATHLETE_PROFILE_REQUIRED')
      if (t.team_members.some(row => row.athlete_id === invitee.id && row.team_id !== team.id && ['pending', 'accepted'].includes(row.status) && t.teams.find(other => other.id === row.team_id)?.tournament_id === team.tournament_id)) return raise(400, 'P0001', 'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER')
      const embedded = { id: team.id, name: team.name, status: team.status, tournaments: team.tournaments ? { name: team.tournaments.name, location: team.tournaments.location } : null }
      let member = t.team_members.find(row => row.team_id === team.id && row.athlete_id === invitee.id)
      if (member) Object.assign(member, { status: 'pending', invited_by: me, invited_at: new Date().toISOString(), responded_at: null })
      else {
        member = { id: crypto.randomUUID(), team_id: team.id, athlete_id: invitee.id, invited_by: me, status: 'pending', invited_at: new Date().toISOString(), created_at: new Date().toISOString(), responded_at: null, teams: embedded }
        t.team_members.push(member)
      }
      state.writes.push('team:invite')
      return { status: 200, body: member.id }
    }
    case 'respond_team_invite': {
      if (!['accepted', 'declined'].includes(body.p_status)) return raise(400, 'P0001', 'INVALID_STATUS')
      const member = t.team_members.find(row => row.id === body.p_member_id && row.athlete_id === me && row.status === 'pending')
      if (!member) return raise(400, 'P0001', 'INVITE_NOT_FOUND')
      Object.assign(member, { status: body.p_status, responded_at: new Date().toISOString() })
      state.writes.push(`team:invite-${body.p_status}`)
      return { status: 200, body: null }
    }
    case 'submit_tournament_team_safely': {
      // sql/99: a null in the permission check is a refusal, checked before anything about the team.
      if (!me) return raise(401, '42501', 'AUTH_REQUIRED')
      const team = t.teams.find(row => row.id === body.p_team_id)
      if (!team) return raise(400, 'P0001', 'TEAM_NOT_FOUND')
      const tournament = t.tournaments.find(row => row.id === team.tournament_id)
      const admin = t.profiles.find(row => row.id === me)?.role === 'admin'
      if (!(team.created_by === me || (tournament?.organizer_id != null && tournament.organizer_id === me) || admin)) return raise(403, '42501', 'NOT_ALLOWED')
      if (!tournament) return raise(400, 'P0001', 'TOURNAMENT_NOT_FOUND')
      if (team.status !== 'draft') return raise(400, 'P0001', 'TEAM_NOT_DRAFT')
      if (tournament.status !== 'open') return raise(400, 'P0001', 'TOURNAMENT_CLOSED')
      if (!t.team_members.some(row => row.team_id === team.id && row.status === 'accepted')) return raise(400, 'P0001', 'ACCEPTED_ROSTER_REQUIRED')
      if (tournament.max_teams != null && t.teams.filter(row => row.tournament_id === tournament.id && ['pending', 'confirmed'].includes(row.status)).length >= tournament.max_teams) return raise(400, 'P0001', 'TOURNAMENT_FULL')
      team.status = 'pending'
      for (const row of t.team_members) if (row.team_id === team.id && row.teams) row.teams.status = 'pending'
      state.writes.push('team:submit')
      return { status: 200, body: null }
    }
    case 'team_for_staff': {
      const team = t.teams.find(row => row.id === body.p_team_id)
      const staff = team && (team.created_by === me || t.team_staff.some(row => row.team_id === team.id && row.user_id === me && row.status === 'accepted'))
      return { status: 200, body: staff ? [{ id: team.id, name: team.name, tournament_id: team.tournament_id, tournament_name: null, start_date: null, is_head: team.created_by === me }] : [] }
    }
    case 'team_staff_list': {
      const team = t.teams.find(row => row.id === body.p_team_id)
      if (!team || team.created_by !== me) return { status: 200, body: [] }
      const head = t.profiles.find(row => row.id === team.created_by)
      return { status: 200, body: [{ id: null, user_id: team.created_by, name: head?.full_name ?? '', email: null, status: 'accepted', is_head: true, is_me: true }] }
    }
    case 'team_roster_names': {
      const ids = Array.isArray(body.p_team_ids) ? body.p_team_ids : []
      return { status: 200, body: t.team_members.filter(row => ids.includes(row.team_id) && ['pending', 'accepted'].includes(row.status) && t.teams.find(team => team.id === row.team_id)?.created_by === me).map(row => {
        const profile = t.athlete_profiles.find(item => item.user_id === row.athlete_id)
        return { team_id: row.team_id, athlete_id: row.athlete_id, display_name: profile?.display_name ?? null, position: profile?.position ?? null }
      }) }
    }
    // Lists the team pages read that are empty in these flows (no events, news, plans, notes,
    // minutes, staff or tournament entries). Each one's own rules are not modelled.
    case 'my_entry_rosters': case 'my_upcoming_team_events': case 'my_children_team_memberships':
    case 'my_team_announcements': case 'my_team_training_plans': case 'my_coach_notes':
    case 'my_match_minutes': case 'my_staff_teams': case 'my_team_staff':
      return { status: 200, body: [] }
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
    state.trace.push([Date.now(), 'mock', req.method, url.pathname.replace('/rest/v1/', '') + (url.search ? '?' + decodeURIComponent(url.search.slice(1)).slice(0, 80) : '')])
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
