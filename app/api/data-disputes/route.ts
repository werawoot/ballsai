import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const subjectTypes = new Set(['athlete_profile', 'player_rank', 'rating_event', 'match_result', 'performance'])
const categories = new Set(['identity', 'match_result', 'rating', 'statistics', 'ranking', 'privacy', 'other'])

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
  const body = await request.json().catch(() => null) as { subjectType?: string; subjectId?: string; category?: string; description?: string } | null
  if (!body || !subjectTypes.has(body.subjectType ?? '') || !categories.has(body.category ?? '') || !body.subjectId || typeof body.description !== 'string') {
    return NextResponse.json({ error: 'INVALID_DISPUTE_PAYLOAD' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('open_data_dispute_safely', {
    p_subject_type: body.subjectType,
    p_subject_id: body.subjectId,
    p_category: body.category,
    p_description: body.description,
  })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') return NextResponse.json({ error: 'DATA_TRUST_SCHEMA_REQUIRED' }, { status: 503 })
    if (error.code === '42501') return NextResponse.json({ error: 'DISPUTE_SUBJECT_FORBIDDEN' }, { status: 403 })
    return NextResponse.json({ error: 'DISPUTE_CREATE_FAILED' }, { status: 400 })
  }
  return NextResponse.json({ id: data }, { status: 201 })
}
