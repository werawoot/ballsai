import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { apiError } from '@/lib/api-error'
import { UUID_PATTERN, venuePhotoRpcError } from '@/lib/venue-photo-errors'

type Params = { params: Promise<{ venueId: string; photoId: string }> }
type Ids = { venueId: string; photoId: string }

function badId(ids: Ids) {
  return !UUID_PATTERN.test(ids.venueId) || !UUID_PATTERN.test(ids.photoId)
}

export async function PATCH(_request: Request, context: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const ids = await context.params
  if (badId(ids)) return apiError('photoIdInvalid', 400)

  const { error } = await supabase.rpc('set_venue_photo_cover_safely', { p_photo_id: ids.photoId })
  if (error) return venuePhotoRpcError(error.code, error.message ?? '')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, context: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const ids = await context.params
  if (badId(ids)) return apiError('photoIdInvalid', 400)

  // The rpc authorises the delete and returns the object path. Only once the row is gone
  // is the private object removed, so a refused delete never destroys a file.
  const { data: objectPath, error } = await supabase.rpc('remove_venue_photo_safely', {
    p_photo_id: ids.photoId,
  })
  if (error) return venuePhotoRpcError(error.code, error.message ?? '')

  const { error: storageError } = await supabase.storage.from('venue-photos').remove([objectPath as string])
  // The row is what the app reads. A stranded object is an operations concern, not a
  // reason to tell the owner the delete failed.
  if (storageError) return NextResponse.json({ ok: true, storageCleanupFailed: true })
  return NextResponse.json({ ok: true })
}
