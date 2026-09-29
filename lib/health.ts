import type { SupabaseClient } from '@supabase/supabase-js'

// T30. What /api/health answers, and what a browser error report may carry. An uptime
// monitor calls /api/health every minute or so: 200 means the app runs and its database
// answers, 503 means it does not. Nothing here needs a secret; nothing it returns names
// a user, a table's contents or a database error.

type Health = {
  status: 'ok' | 'degraded'
  httpStatus: 200 | 503
  version: string
  checks: { database: { ok: boolean; ms: number; timedOut?: boolean } }
}

export async function checkHealth(client: SupabaseClient, { version, timeoutMs = 3000 }: { version?: string; timeoutMs?: number }): Promise<Health> {
  const started = Date.now()
  // One row from a table every visitor may read: proves the database and the API answer.
  const read = Promise.resolve(client.from('tournaments').select('id').limit(1)).then(({ error }) => ({ ok: !error, timedOut: false }))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ ok: boolean; timedOut: boolean }>(resolve => { timer = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs) })
  const result = await Promise.race([read.catch(() => ({ ok: false, timedOut: false })), timeout])
  clearTimeout(timer)
  const database = { ok: result.ok, ms: Date.now() - started, ...(result.timedOut ? { timedOut: true } : {}) }
  return {
    status: database.ok ? 'ok' : 'degraded',
    httpStatus: database.ok ? 200 : 503,
    version: version ? version.slice(0, 7) : 'unknown',
    checks: { database },
  }
}

export type ClientErrorReport = { message: string; digest: string | null; path: string | null }

// A browser report is untrusted input written to the logs: keep it short, drop anything
// that could identify a person, and keep only the path of the page (never its query,
// which can carry ids or tokens).
export function cleanClientError(input: unknown): ClientErrorReport | null {
  if (!input || typeof input !== 'object') return null
  const { message, digest, path } = input as Record<string, unknown>
  if (typeof message !== 'string' || !message.trim()) return null
  const cleaned = message
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\d{6,}/g, '[number]')
    .slice(0, 300)
  const cleanPath = typeof path === 'string' && path.startsWith('/') ? path.split(/[?#]/)[0].slice(0, 200) : null
  return { message: cleaned, digest: typeof digest === 'string' ? digest.slice(0, 64) : null, path: cleanPath }
}
