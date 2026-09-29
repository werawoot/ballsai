import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkHealth } from '@/lib/health'

// For uptime monitors (T30): 200 when the app and its database answer, 503 otherwise.
// Signed-out client, one row from a public table, never cached.
export const dynamic = 'force-dynamic'

export async function GET() {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { httpStatus, ...health } = await checkHealth(client, { version: process.env.VERCEL_GIT_COMMIT_SHA })
  return NextResponse.json(health, { status: httpStatus, headers: { 'Cache-Control': 'no-store' } })
}
