/**
 * Route-level regression tests for POST /api/mobile/account/delete-athlete-data.
 *
 * The real route is transpiled and run with mocked imports so these tests pin its
 * bearer-auth boundary without touching Supabase or deleting real data.
 *
 *   node --test scripts/mobile-account-deletion.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const require = createRequire(`${root}/package.json`)
const ts = require('typescript')

function loadRoute({ allowed = true, user = { id: 'athlete-1' } } = {}) {
  const calls = []
  const source = readFileSync(`${root}/app/api/mobile/account/delete-athlete-data/route.ts`, 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) },
  }
  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, init) => ({ status: init?.status ?? 200, headers: init?.headers, body }),
      },
    },
    '@/lib/account-deletion': {
      ACCOUNT_DELETION_CONFIRM_PHRASE: 'ลบข้อมูลของฉัน',
      deleteAthleteData: async (client, userId, route) => {
        calls.push({ kind: 'delete', client, userId, route })
        return { ok: true, anonymisedRankings: 2, removedHighlights: 1 }
      },
    },
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed, retryAfterSeconds: 600 }),
    },
    '@/lib/supabase-server': {
      createAccessTokenSupabaseClient: token => {
        calls.push({ kind: 'client', token })
        return supabase
      },
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
  return { POST: exports.POST, calls, supabase }
}

function request({ authorization, body = { confirm: 'ลบข้อมูลของฉัน' } } = {}) {
  return {
    headers: { get: name => name.toLowerCase() === 'authorization' ? authorization ?? null : null },
    json: async () => body,
  }
}

describe('mobile account deletion authentication', () => {
  it('rejects a missing bearer token before creating a client or deleting data', async () => {
    const { POST, calls } = loadRoute()
    const response = await POST(request())
    assert.equal(response.status, 401)
    assert.equal(calls.length, 0)
  })

  it('rejects an invalid or expired bearer identity before deleting data', async () => {
    const { POST, calls } = loadRoute({ user: null })
    const response = await POST(request({ authorization: 'Bearer expired-token' }))
    assert.equal(response.status, 401)
    assert.equal(calls.filter(call => call.kind === 'delete').length, 0)
  })

  it('rejects malformed authorization schemes', async () => {
    for (const authorization of ['token', 'Basic token', 'Bearer', 'Bearer   ']) {
      const { POST, calls } = loadRoute()
      const response = await POST(request({ authorization }))
      assert.equal(response.status, 401)
      assert.equal(calls.length, 0)
    }
  })
})

describe('mobile account deletion confirmation and dispatch', () => {
  it('requires the exact Thai confirmation phrase', async () => {
    for (const confirm of [undefined, '', 'ลบข้อมูล', 'DELETE']) {
      const { POST, calls } = loadRoute()
      const response = await POST(request({ authorization: 'Bearer valid-token', body: { confirm } }))
      assert.equal(response.status, 400)
      assert.equal(calls.filter(call => call.kind === 'delete').length, 0)
    }
  })

  it('uses the bearer-scoped client and the shared deletion service', async () => {
    const { POST, calls, supabase } = loadRoute()
    const response = await POST(request({ authorization: 'Bearer valid-token' }))
    assert.equal(response.status, 200)
    assert.equal(response.body.ok, true)
    assert.equal(calls[0].kind, 'client')
    assert.equal(calls[0].token, 'valid-token')
    assert.equal(calls[1].kind, 'delete')
    assert.equal(calls[1].client, supabase)
    assert.equal(calls[1].userId, 'athlete-1')
    assert.equal(calls[1].route, '/api/mobile/account/delete-athlete-data')
  })

  it('rate limits before reading the bearer token', async () => {
    const { POST, calls } = loadRoute({ allowed: false })
    const response = await POST(request({ authorization: 'Bearer valid-token' }))
    assert.equal(response.status, 429)
    assert.equal(response.headers['Retry-After'], '600')
    assert.equal(calls.length, 0)
  })

  it('keeps the web and mobile routes on the same deletion service', () => {
    const webSource = readFileSync(`${root}/app/api/account/delete-athlete-data/route.ts`, 'utf8')
    const mobileSource = readFileSync(`${root}/app/api/mobile/account/delete-athlete-data/route.ts`, 'utf8')
    assert.match(webSource, /deleteAthleteData\(/)
    assert.match(mobileSource, /deleteAthleteData\(/)
    assert.doesNotMatch(mobileSource, /createServerSupabaseClient/)
  })
})
