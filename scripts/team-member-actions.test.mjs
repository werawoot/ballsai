/**
 * Route-level regression tests for PATCH /api/team-members/[memberId].
 *
 * The dispatch used to fall through to the destructive `remove` branch for any
 * unrecognised action, so this file loads the REAL route handler (transpiled with the
 * TypeScript compiler already in devDependencies, run in a VM with mocked imports) and
 * asserts on which RPC it calls, if any.
 *
 *   node --test scripts/team-member-actions.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const require = createRequire(`${root}/package.json`)
const ts = require('typescript')

/** Minimal stand-ins for next/server and the Supabase server client. */
function loadRoute({ user = { id: 'caller' }, rpcError = null } = {}) {
  const calls = []
  const source = readFileSync(`${root}/app/api/team-members/[memberId]/route.ts`, 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, init) => ({ status: init?.status ?? 200, body }),
      },
    },
    '@/lib/supabase-server': {
      createServerSupabaseClient: async () => ({
        auth: { getUser: async () => ({ data: { user } }) },
        rpc: async (name, args) => {
          calls.push({ name, args })
          return { error: rpcError }
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
  return { PATCH: exports.PATCH, calls }
}

const params = { params: { memberId: 'member-1' } }
const request = body => ({ json: async () => body })
const validReason = 'ออกจากทีมตามที่ตกลงกับผู้จัด'

describe('unknown actions are rejected, never treated as remove', () => {
  for (const action of ['delete', 'REMOVE', 'Remove', 'remove ', 'drop', '', 'approve;', '../remove']) {
    it(`rejects action ${JSON.stringify(action)} with 400 and calls no RPC`, async () => {
      const { PATCH, calls } = loadRoute()
      const response = await PATCH(request({ action, reason: validReason }), params)

      assert.equal(response.status, 400, 'an unknown action must be a client error')
      assert.equal(response.body.error, 'คำสั่งไม่ถูกต้อง')
      assert.equal(calls.length, 0, 'no RPC may run for an unknown action — least of all remove_team_member')
    })
  }

  it('rejects a non-string action without falling through', async () => {
    for (const action of [1, true, {}, [], { action: 'remove' }]) {
      const { PATCH, calls } = loadRoute()
      const response = await PATCH(request({ action, reason: validReason }), params)
      assert.equal(response.status, 400)
      assert.equal(calls.length, 0)
    }
  })

  it('rejects an unknown action even when a valid removal reason is supplied', async () => {
    const { PATCH, calls } = loadRoute()
    const response = await PATCH(request({ action: 'purge', reason: validReason }), params)
    assert.equal(response.status, 400)
    assert.ok(!calls.some(call => call.name === 'remove_team_member'))
  })
})

describe('each known action routes to its own RPC', () => {
  it('defaults to respond for the original body shape (no action field)', async () => {
    const { PATCH, calls } = loadRoute()
    const response = await PATCH(request({ status: 'accepted' }), params)
    assert.equal(response.status, 200)
    assert.equal(calls[0].name, 'respond_team_invite')
    // Compared field by field: objects built inside the VM realm are not
    // reference-equal to a host literal under deepEqual.
    assert.equal(calls[0].args.p_member_id, 'member-1')
    assert.equal(calls[0].args.p_status, 'accepted')
  })

  it('rejects a respond call with an invalid status', async () => {
    const { PATCH, calls } = loadRoute()
    const response = await PATCH(request({ action: 'respond', status: 'removed' }), params)
    assert.equal(response.status, 400)
    assert.equal(calls.length, 0)
  })

  it('approves and declines through their own RPCs', async () => {
    for (const [action, rpc] of [['approve', 'approve_team_request'], ['decline', 'decline_team_request']]) {
      const { PATCH, calls } = loadRoute()
      const response = await PATCH(request({ action }), params)
      assert.equal(response.status, 200)
      assert.equal(calls[0].name, rpc)
    }
  })

  it('removes only with a 10-500 character reason', async () => {
    const short = loadRoute()
    assert.equal((await short.PATCH(request({ action: 'remove', reason: 'สั้น' }), params)).status, 400)
    assert.equal(short.calls.length, 0, 'the reason is validated before the RPC runs')

    const long = loadRoute()
    assert.equal((await long.PATCH(request({ action: 'remove', reason: 'x'.repeat(501) }), params)).status, 400)
    assert.equal(long.calls.length, 0)

    const ok = loadRoute()
    const response = await ok.PATCH(request({ action: 'remove', reason: validReason }), params)
    assert.equal(response.status, 200)
    assert.equal(ok.calls[0].name, 'remove_team_member')
    assert.equal(ok.calls[0].args.p_reason, validReason)
  })
})

describe('authorization and RPC failures stay fail-closed', () => {
  it('refuses an anonymous caller before any RPC', async () => {
    const { PATCH, calls } = loadRoute({ user: null })
    const response = await PATCH(request({ action: 'remove', reason: validReason }), params)
    assert.equal(response.status, 401)
    assert.equal(calls.length, 0)
  })

  it('does not reveal whether the row exists when the RPC refuses', async () => {
    const { PATCH } = loadRoute({ rpcError: { message: 'TEAM_REQUEST_NOT_FOUND' } })
    const response = await PATCH(request({ action: 'approve' }), params)
    assert.equal(response.status, 404)
    assert.match(response.body.error, /ไม่มีสิทธิ์จัดการทีมนี้/, 'not-found and not-authorised share one message')
  })

  it('surfaces an unmapped RPC failure as a client error, not a success', async () => {
    const { PATCH } = loadRoute({ rpcError: { message: 'some unexpected postgres error' } })
    const response = await PATCH(request({ action: 'remove', reason: validReason }), params)
    assert.equal(response.status, 400)
    assert.equal(response.body.ok, undefined)
  })
})
