import { NextResponse } from 'next/server'
import { cleanClientError } from '@/lib/health'
import { logServerError } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'

// Browser crashes caught by app/error.tsx and app/global-error.tsx land here, so they
// appear in the server logs next to server errors, as event "client_error" (T30).
export async function POST(request: Request) {
  const limit = await checkRateLimit(request, { scope: 'client-errors', limit: 20, windowSeconds: 60 })
  if (!limit.allowed) return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

  const report = cleanClientError(await request.json().catch(() => null))
  if (!report) return new NextResponse(null, { status: 400 })

  logServerError({ event: 'client_error', route: report.path ?? undefined, metadata: { message: report.message, digest: report.digest } })
  return new NextResponse(null, { status: 204 })
}
