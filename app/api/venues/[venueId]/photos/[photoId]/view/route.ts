import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { UUID_PATTERN } from '@/lib/venue-photo-errors'
import { VENUE_PHOTO_PUBLIC_MIGRATION, VENUE_PHOTO_PUBLIC_TTL_SECONDS } from '@/lib/venue-photo-public'

// The only UI-facing way to obtain a gallery URL for a venue photo.
//
// It takes two opaque ids and nothing else: the object path comes from the photo record,
// never from the request, so no caller can point Storage at a path of its own. Delivery
// still depends on SQL45's narrow anon policy on storage.objects, which signs an object
// only when its photo row is 'visible' and the venue is published. This route applies the
// same rule first so a refusal costs no Storage call and reveals no reason.
//
// Deliberately unauthenticated: the public gallery has to work signed out. An owner or
// admin reviewing a pending photo uses the /preview route instead.
export async function GET(_request: Request, { params }: { params: { venueId: string; photoId: string } }) {
  if (!UUID_PATTERN.test(params.venueId) || !UUID_PATTERN.test(params.photoId)) {
    return NextResponse.json({ error: 'รหัสรูปไม่ถูกต้อง' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const notFound = () => NextResponse.json({ error: 'ไม่พบรูปนี้' }, { status: 404 })

  const { data: photo, error: photoError } = await supabase
    .from('venue_photos')
    .select('id, venue_id, object_path, moderation_status, caption')
    .eq('id', params.photoId)
    .eq('venue_id', params.venueId)
    .maybeSingle()

  if (photoError) {
    if (photoError.code === '42P01' || photoError.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'ระบบรูปสนามยังไม่พร้อม', migration: VENUE_PHOTO_PUBLIC_MIGRATION },
        { status: 503 },
      )
    }
    return notFound()
  }

  // Every refusal below is the same 404: a visitor learns nothing about whether a photo
  // exists but is still awaiting moderation.
  if (!photo || photo.venue_id !== params.venueId) return notFound()
  if (photo.moderation_status !== 'visible') return notFound()

  const { data: venue } = await supabase
    .from('venue_profiles')
    .select('id, is_published')
    .eq('id', params.venueId)
    .maybeSingle()
  if (!venue?.is_published) return notFound()

  const { data: signed, error: signedError } = await supabase.storage
    .from('venue-photos')
    .createSignedUrl(photo.object_path as string, VENUE_PHOTO_PUBLIC_TTL_SECONDS)
  if (signedError || !signed?.signedUrl) return notFound()

  // Short-lived, never stored, and not cacheable by a proxy on the way out.
  return NextResponse.json(
    {
      url: signed.signedUrl,
      expiresIn: VENUE_PHOTO_PUBLIC_TTL_SECONDS,
      alt: typeof photo.caption === 'string' && photo.caption.trim() ? photo.caption.trim() : null,
    },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  )
}
