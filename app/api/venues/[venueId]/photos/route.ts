import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { UUID_PATTERN, venuePhotoRpcError } from '@/lib/venue-photo-errors'
import { VENUE_PHOTO_LIMIT } from '@/lib/venue-photo-upload'

export async function POST(request: Request, { params }: { params: { venueId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  if (!UUID_PATTERN.test(params.venueId)) {
    return NextResponse.json({ error: 'รหัสสนามไม่ถูกต้อง' }, { status: 400 })
  }

  const body = await request.json().catch(() => null) as { objectPath?: string; caption?: string } | null
  const objectPath = body?.objectPath?.trim()
  // The path must sit inside this venue's folder. SQL43 checks this too; refusing here
  // keeps a mistyped path from ever reaching the database.
  if (!objectPath || !objectPath.startsWith(`${params.venueId.toLowerCase()}/`)) {
    return NextResponse.json({ error: 'ที่อยู่ไฟล์ไม่ถูกต้อง' }, { status: 400 })
  }

  // moderation_status is deliberately absent: SQL43 defaults it to 'pending' and only
  // an admin may change it, so the owner has no way to publish their own photo.
  const { data, error } = await supabase.rpc('add_venue_photo_safely', {
    p_venue_id: params.venueId,
    p_object_path: objectPath,
    p_caption: body?.caption?.trim() ?? '',
  })

  if (error) return venuePhotoRpcError(error.code, error.message ?? '')
  return NextResponse.json({ ok: true, photoId: data })
}

export async function PATCH(request: Request, { params }: { params: { venueId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  if (!UUID_PATTERN.test(params.venueId)) {
    return NextResponse.json({ error: 'รหัสสนามไม่ถูกต้อง' }, { status: 400 })
  }

  const body = await request.json().catch(() => null) as { photoIds?: unknown } | null
  const photoIds = body?.photoIds
  if (!Array.isArray(photoIds) || photoIds.length === 0 || photoIds.length > VENUE_PHOTO_LIMIT
      || photoIds.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    return NextResponse.json({ error: 'ลำดับรูปไม่ถูกต้อง กรุณาโหลดหน้าใหม่' }, { status: 400 })
  }

  const { error } = await supabase.rpc('reorder_venue_photos_safely', { p_photo_ids: photoIds })
  if (error) return venuePhotoRpcError(error.code, error.message ?? '')
  return NextResponse.json({ ok: true })
}
