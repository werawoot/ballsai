import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { AVATAR_BUCKET, avatarPath as ownAvatarPath, ownAvatarPaths } from '@/lib/athlete-avatar'

const CONFIRM_PHRASE = 'ลบข้อมูลของฉัน'

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'account-data-deletion', limit: 3, windowSeconds: 60 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null
  if (body?.confirm?.trim() !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `กรุณาพิมพ์ "${CONFIRM_PHRASE}" เพื่อยืนยัน` }, { status: 400 })
  }

  // Read the avatar path before the profile row is gone; the object itself is removed
  // after the database work succeeds, so a failure never leaves data half-deleted.
  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('profile_image_url')
    .eq('user_id', user.id)
    .maybeSingle()
  const avatarPath = ownAvatarPath(athlete?.profile_image_url, user.id)

  const { data: result, error } = await supabase.rpc('delete_my_athlete_data')

  if (error) {
    logServerError({
      event: 'account_data_deletion_failed',
      userId: user.id,
      route: '/api/account/delete-athlete-data',
      metadata: { code: error.code },
      error,
    })
    // The function ships as sql/data-deletion-v1.sql and must be applied first.
    if (error.code === '42883' || error.message.includes('does not exist')) {
      return NextResponse.json(
        { error: 'ฐานข้อมูลยังไม่มีระบบลบข้อมูล กรุณา apply sql/data-deletion-v1.sql ก่อน' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: 'ลบข้อมูลไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ' }, { status: 400 })
  }

  const payload = (result ?? {}) as { anonymisedRankings?: number; highlightPaths?: string[] }
  const highlightPaths = payload.highlightPaths ?? []

  if (highlightPaths.length > 0) {
    const { error: highlightError } = await supabase.storage.from('athlete-highlights').remove(highlightPaths)
    if (highlightError) {
      logServerError({
        event: 'account_data_deletion_storage_failed',
        userId: user.id,
        route: '/api/account/delete-athlete-data',
        metadata: { bucket: 'athlete-highlights', files: highlightPaths.length },
        error: highlightError,
      })
    }
  }

  // Every photo in the athlete's folder, not only the current one: a replaced photo stays
  // in storage otherwise (T51).
  const avatarPaths = await ownAvatarPaths(supabase, user.id)
    .then(paths => [...new Set([...(avatarPath ? [avatarPath] : []), ...paths])])
    .catch(error => {
      logServerError({ event: 'account_data_deletion_storage_failed', userId: user.id, route: '/api/account/delete-athlete-data', metadata: { bucket: AVATAR_BUCKET, step: 'list' }, error })
      return avatarPath ? [avatarPath] : []
    })
  for (let start = 0; start < avatarPaths.length; start += 100) {
    const { error: avatarError } = await supabase.storage.from(AVATAR_BUCKET).remove(avatarPaths.slice(start, start + 100))
    if (avatarError) {
      logServerError({
        event: 'account_data_deletion_storage_failed',
        userId: user.id,
        route: '/api/account/delete-athlete-data',
        metadata: { bucket: AVATAR_BUCKET, files: avatarPaths.length },
        error: avatarError,
      })
    }
  }

  logServerEvent({
    event: 'account_data_deleted',
    userId: user.id,
    route: '/api/account/delete-athlete-data',
    metadata: {
      anonymisedRankings: payload.anonymisedRankings ?? 0,
      removedHighlights: highlightPaths.length,
      removedAvatars: avatarPaths.length,
    },
  })

  revalidateTag('public-athletes')
  revalidateTag('public-ranking')

  return NextResponse.json({
    ok: true,
    anonymisedRankings: payload.anonymisedRankings ?? 0,
    removedHighlights: highlightPaths.length,
  })
}
