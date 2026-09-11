/**
 * Regression coverage for direct bypass attempts on the join-request path.
 *
 * Two layers are checked, because they fail in different ways:
 *
 *  1. The route (`POST /api/teams/[teamId]/join`) — loaded for real and driven with
 *     each RPC error code, since a caller who knows a team UUID skips the picker
 *     entirely and reaches this handler directly.
 *  2. The SQL that actually enforces it — `sql/25-team-discovery-v1.sql` is parsed and
 *     asserted to still contain every guard. Postgres is not available here, so this
 *     catches a guard being dropped in an edit; it does not prove runtime behaviour.
 *     The staging checks in the handover cover that.
 *
 *   node --test scripts/team-join-eligibility.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const require = createRequire(`${root}/package.json`)
const ts = require('typescript')

function loadJoinRoute({ user = { id: 'athlete-1' }, rpcError = null, rpcData = 'member-1' } = {}) {
  const calls = []
  const source = readFileSync(`${root}/app/api/teams/[teamId]/join/route.ts`, 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
    '@/lib/supabase-server': {
      createServerSupabaseClient: async () => ({
        auth: { getUser: async () => ({ data: { user } }) },
        rpc: async (name, args) => {
          calls.push({ name, args })
          return rpcError ? { data: null, error: rpcError } : { data: rpcData, error: null }
        },
      }),
    },
  }
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    console,
    require: name => {
      if (!(name in mocks)) throw new Error(`unexpected import: ${name}`)
      return mocks[name]
    },
  })
  return { POST: exports.POST, calls }
}

const params = { params: { teamId: 'team-uuid-known-to-attacker' } }

describe('a caller who knows a team UUID cannot bypass the discovery filter', () => {
  const cases = [
    { code: 'TEAM_NOT_ACCEPTING_REQUESTS', status: 409, match: /ยังไม่เปิดรับสมาชิก|ปิดรับสมัคร/ },
    { code: 'CANNOT_REQUEST_OWN_TEAM', status: 400, match: /ผู้ดูแลทีมนี้อยู่แล้ว/ },
    { code: 'TEAM_NOT_FOUND', status: 404, match: /ไม่พบทีมนี้/ },
    { code: 'ACTIVE_MEMBERSHIP_EXISTS', status: 409, match: /อยู่ในทีมนี้|มีคำขอค้าง/ },
    { code: 'TEAM_MEMBERSHIP_RATE_LIMITED', status: 429, match: /10 นาที/ },
  ]

  for (const { code, status, match } of cases) {
    it(`maps ${code} to ${status} and never reports success`, async () => {
      const { POST, calls } = loadJoinRoute({ rpcError: { message: `... ${code} ...` } })
      const response = await POST(new Request('https://example.invalid'), params)

      assert.equal(response.status, status)
      assert.match(response.body.error, match)
      assert.equal(response.body.ok, undefined, 'a refused request must not read as created')
      assert.equal(response.body.memberId, undefined, 'and must not return a membership id')
      assert.equal(calls[0].name, 'request_team_membership', 'enforcement stays in the RPC')
    })
  }

  it('fails closed on an unmapped RPC error rather than assuming success', async () => {
    const { POST } = loadJoinRoute({ rpcError: { message: 'unexpected postgres failure' } })
    const response = await POST(new Request('https://example.invalid'), params)
    assert.equal(response.status, 500)
    assert.equal(response.body.ok, undefined)
  })

  it('refuses an anonymous caller before the RPC runs', async () => {
    const { POST, calls } = loadJoinRoute({ user: null })
    const response = await POST(new Request('https://example.invalid'), params)
    assert.equal(response.status, 401)
    assert.equal(calls.length, 0)
  })

  it('passes the caller-supplied team id straight to the RPC, which owns the decision', async () => {
    const { POST, calls } = loadJoinRoute()
    const response = await POST(new Request('https://example.invalid'), params)
    assert.equal(response.status, 200)
    assert.equal(calls[0].args.p_team_id, 'team-uuid-known-to-attacker')
  })
})

describe('sql/25 keeps every eligibility guard in request_team_membership', () => {
  const sql = readFileSync(`${root}/sql/25-team-discovery-v1.sql`, 'utf8')
  const body = sql.slice(sql.indexOf('create or replace function public.request_team_membership'))

  const guards = [
    ['authenticated caller', /v_user_id is null then raise exception 'AUTH_REQUIRED'/],
    ['team must exist', /raise exception 'TEAM_NOT_FOUND'/],
    ['team must be confirmed', /v_team_status is distinct from 'confirmed'/],
    ['tournament must be open', /v_tournament_status is distinct from 'open'/],
    ['ineligible state is fail-closed', /raise exception 'TEAM_NOT_ACCEPTING_REQUESTS'/],
    ['caller is not the team creator', /v_created_by = v_user_id/],
    ['caller is not the tournament organizer', /v_organizer_id = v_user_id/],
    ['self-managed teams are fail-closed', /raise exception 'CANNOT_REQUEST_OWN_TEAM'/],
    ['active membership still blocks', /raise exception 'ACTIVE_MEMBERSHIP_EXISTS'/],
    ['10-minute cooldown preserved', /interval '10 minutes'[\s\S]*TEAM_MEMBERSHIP_RATE_LIMITED/],
    ['insert preserves history', /insert into public\.team_members[\s\S]*direction\)/],
    ['request direction preserved', /'request'\) returning id into v_member_id/],
    ['grant preserved', /grant execute on function public\.request_team_membership\(uuid\) to authenticated/],
    ['revoked from public first', /revoke all on function public\.request_team_membership\(uuid\) from public/],
  ]

  for (const [label, pattern] of guards) {
    it(`still enforces: ${label}`, () => {
      assert.match(label.includes('grant') || label.includes('revoked') ? sql : body, pattern)
    })
  }

  it('never updates an existing membership row in place', () => {
    assert.ok(!/update public\.team_members/.test(body), 'a rejoin must insert a new period, not rewrite history')
  })

  it('applies the same eligibility rule the discovery function advertises', () => {
    const discovery = sql.slice(
      sql.indexOf('create or replace function public.list_joinable_teams'),
      sql.indexOf('create or replace function public.list_my_team_labels'),
    )
    for (const rule of [/t\.status = 'confirmed'/, /tr\.status = 'open'/, /created_by is distinct from auth\.uid\(\)/, /organizer_id is distinct from auth\.uid\(\)/]) {
      assert.match(discovery, rule, 'discovery and enforcement must express the same rule')
    }
  })
})
