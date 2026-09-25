import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 })

  const [evidence, disputes, anomalies] = await Promise.all([
    supabase.from('verification_evidence').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
    supabase.from('data_disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
    supabase.from('data_anomaly_flags').select('id', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']),
  ])
  const results = [evidence, disputes, anomalies]
  if (results.some(result => result.error)) {
    return NextResponse.json({ error: 'DATA_TRUST_SCHEMA_REQUIRED', migration: 'sql/31-data-trust-foundation-v1.sql' }, { status: 503 })
  }
  return NextResponse.json({ pendingEvidence: evidence.count ?? 0, openDisputes: disputes.count ?? 0, anomalyFlags: anomalies.count ?? 0 })
}
