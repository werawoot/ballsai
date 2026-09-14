import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 })
  const body = await request.json().catch(() => null) as { disputeId?: string; status?: string; resolution?: string } | null
  if (!body?.disputeId || !['in_review', 'upheld', 'rejected'].includes(body.status ?? '') || typeof body.resolution !== 'string') {
    return NextResponse.json({ error: 'INVALID_DISPUTE_RESOLUTION' }, { status: 400 })
  }
  const { error } = await supabase.rpc('admin_resolve_data_dispute_with_audit', {
    p_dispute_id: body.disputeId,
    p_status: body.status,
    p_resolution: body.resolution,
  })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') return NextResponse.json({ error: 'ADMIN_AUDIT_SCHEMA_REQUIRED' }, { status: 503 })
    return NextResponse.json({ error: 'DISPUTE_RESOLVE_FAILED' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
