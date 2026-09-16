import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { UUID_PATTERN, venuePhotoRpcError } from '@/lib/venue-photo-errors'

type Params = { params: { venueId: string; photoId: string } }

function badId({ params }: Params) {
  return !UUID_PATTERN.test(params.venueId) || !UUID_PATTERN.test(params.photoId)
}

export async function PATCH(_request: Request, context: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  if (badId(context)) return NextResponse.json({ error: 'รหัสรูปไม่ถูกต้อง' }, { status: 400 })

  const { error } = await supabase.rpc('set_venue_photo_cover_safely', { p_photo_id: context.params.photoId })
  if (error) return venuePhotoRpcError(error.code, error.message ?? '')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, context: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  if (badId(context)) return NextResponse.json({ error: 'รหัสรูปไม่ถูกต้อง' }, { status: 400 })

  // The rpc authorises the delete and returns the object path. Only once the row is gone
  // is the private object removed, so a refused delete never destroys a file.
  const { data: objectPath, error } = await supabase.rpc('remove_venue_photo_safely', {
    p_photo_id: context.params.photoId,
  })
  if (error) return venuePhotoRpcError(error.code, error.message ?? '')

  const { error: storageError } = await supabase.storage.from('venue-photos').remove([objectPath as string])
  // The row is what the app reads. A stranded object is an operations concern, not a
  // reason to tell the owner the delete failed.
  if (storageError) return NextResponse.json({ ok: true, storageCleanupFailed: true })
  return NextResponse.json({ ok: true })
}
