import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { apiError } from '@/lib/api-error'

type CourtBody = { name?: string; sport?: 'football' | 'futsal'; surface?: string; capacity?: number | null }

export async function POST(request: Request, props: { params: Promise<{ venueId: string }> }) {
  const params = await props.params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const body = await request.json().catch(() => null) as CourtBody | null
  const name = body?.name?.trim()
  if (!name) return apiError('courtNameRequired', 400)
  const capacity = body?.capacity == null ? null : Number(body.capacity)
  const { data, error } = await supabase.rpc('create_venue_court_safely', {
    p_venue_id: params.venueId,
    p_name: name,
    p_sport: body?.sport === 'futsal' ? 'futsal' : 'football',
    p_surface: body?.surface?.trim() ?? '',
    p_capacity: Number.isFinite(capacity) ? capacity : null,
  })
  if (error) return apiError('courtCreateFailed', 400)
  return NextResponse.json({ ok: true, courtId: data })
}
