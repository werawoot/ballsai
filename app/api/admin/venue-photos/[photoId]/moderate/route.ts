import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { UUID_PATTERN, venuePhotoRpcError } from '@/lib/venue-photo-errors'

type Params = { params: { photoId: string } }

// SQL43 owns the authorisation and audit record. This route validates only the HTTP
// boundary, then delegates the state transition to its SECURITY DEFINER RPC.
export async function POST(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  if (!UUID_PATTERN.test(params.photoId)) return NextResponse.json({ error: 'รหัสรูปไม่ถูกต้อง' }, { status: 400 })

  const body = await request.json().catch(() => null) as { status?: unknown } | null
  if (body?.status !== 'visible' && body?.status !== 'hidden') {
    return NextResponse.json({ error: 'สถานะการตรวจรูปไม่ถูกต้อง' }, { status: 400 })
  }

  const { error } = await supabase.rpc('moderate_venue_photo_safely', {
    p_photo_id: params.photoId,
    p_status: body.status,
  })
  if (error) return venuePhotoRpcError(error.code, error.message ?? '')
  return NextResponse.json({ ok: true })
}
