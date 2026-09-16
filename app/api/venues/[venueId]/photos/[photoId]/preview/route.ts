import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { UUID_PATTERN } from '@/lib/venue-photo-errors'
import { VENUE_PHOTO_PREVIEW_TTL_SECONDS } from '@/lib/venue-photo-preview'

// Mints a short-lived signed URL for one private venue photo.
//
// SQL43's venue_photos_owner_or_admin_read policy on storage.objects already limits
// signing to the venue owner and admins, and there is no anon policy on the bucket at
// all. This route checks the same rule before asking Storage so a refusal is a clear
// 403 rather than an opaque storage failure, and so a visitor who can read a `visible`
// row through table RLS still cannot obtain a URL.
export async function GET(_request: Request, { params }: { params: { venueId: string; photoId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  if (!UUID_PATTERN.test(params.venueId) || !UUID_PATTERN.test(params.photoId)) {
    return NextResponse.json({ error: 'รหัสรูปไม่ถูกต้อง' }, { status: 400 })
  }

  const { data: photo, error: photoError } = await supabase
    .from('venue_photos')
    .select('id, venue_id, object_path, moderation_status')
    .eq('id', params.photoId)
    .maybeSingle()

  if (photoError) {
    if (photoError.code === '42P01' || photoError.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'ระบบรูปสนามยังไม่พร้อม กรุณา apply SQL43 ก่อน', migration: 'sql/43-venue-photos-v1.sql' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: 'เปิดรูปไม่สำเร็จ' }, { status: 400 })
  }
  // A photo addressed through the wrong venue is treated as absent rather than
  // confirming that the id exists somewhere else.
  if (!photo || photo.venue_id !== params.venueId) {
    return NextResponse.json({ error: 'ไม่พบรูปนี้' }, { status: 404 })
  }

  const [{ data: venue }, { data: profile }] = await Promise.all([
    supabase.from('venue_profiles').select('owner_id').eq('id', params.venueId).maybeSingle(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])

  const isOwner = venue?.owner_id === user.id
  const isAdmin = profile?.role === 'admin'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'เฉพาะเจ้าของสนามหรือผู้ดูแลระบบเท่านั้นที่ดูรูปนี้ได้' }, { status: 403 })
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from('venue-photos')
    .createSignedUrl(photo.object_path as string, VENUE_PHOTO_PREVIEW_TTL_SECONDS)

  // Storage RLS is the real gate. If it refuses, report it as a permission problem.
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'ไม่สามารถเปิดรูปนี้ได้ในขณะนี้' }, { status: 403 })
  }

  // The URL is short-lived and is never written to the database. Keep proxies and the
  // browser cache from holding on to it.
  return NextResponse.json(
    { url: signed.signedUrl, expiresIn: VENUE_PHOTO_PREVIEW_TTL_SECONDS },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  )
}
