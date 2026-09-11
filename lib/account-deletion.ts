import { revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logServerError, logServerEvent } from '@/lib/monitoring'

export const ACCOUNT_DELETION_CONFIRM_PHRASE = 'ลบข้อมูลของฉัน'

type DeletionFailure = {
  ok: false
  status: 400 | 503
  error: string
}

type DeletionSuccess = {
  ok: true
  anonymisedRankings: number
  removedHighlights: number
}

function avatarPathFromPublicUrl(value: string, userId: string) {
  const marker = '/storage/v1/object/public/athlete-avatars/'
  const markerIndex = value.indexOf(marker)
  if (markerIndex === -1) return null
  const path = decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0])
  return path.startsWith(`${userId}/`) ? path : null
}

export async function deleteAthleteData(
  supabase: SupabaseClient,
  userId: string,
  route: string,
): Promise<DeletionFailure | DeletionSuccess> {
  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('profile_image_url')
    .eq('user_id', userId)
    .maybeSingle()
  const avatarPath = athlete?.profile_image_url
    ? avatarPathFromPublicUrl(athlete.profile_image_url, userId)
    : null

  const { data: result, error } = await supabase.rpc('delete_my_athlete_data')

  if (error) {
    logServerError({
      event: 'account_data_deletion_failed',
      userId,
      route,
      metadata: { code: error.code },
      error,
    })
    if (error.code === '42883' || error.message.includes('does not exist')) {
      return {
        ok: false,
        status: 503,
        error: 'ฐานข้อมูลยังไม่มีระบบลบข้อมูล กรุณา apply sql/data-deletion-v1.sql ก่อน',
      }
    }
    return { ok: false, status: 400, error: 'ลบข้อมูลไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ' }
  }

  const payload = (result ?? {}) as { anonymisedRankings?: number; highlightPaths?: string[] }
  const highlightPaths = payload.highlightPaths ?? []

  if (highlightPaths.length > 0) {
    const { error: highlightError } = await supabase.storage.from('athlete-highlights').remove(highlightPaths)
    if (highlightError) {
      logServerError({
        event: 'account_data_deletion_storage_failed',
        userId,
        route,
        metadata: { bucket: 'athlete-highlights', files: highlightPaths.length },
        error: highlightError,
      })
    }
  }

  if (avatarPath) {
    const { error: avatarError } = await supabase.storage.from('athlete-avatars').remove([avatarPath])
    if (avatarError) {
      logServerError({
        event: 'account_data_deletion_storage_failed',
        userId,
        route,
        metadata: { bucket: 'athlete-avatars' },
        error: avatarError,
      })
    }
  }

  logServerEvent({
    event: 'account_data_deleted',
    userId,
    route,
    metadata: {
      anonymisedRankings: payload.anonymisedRankings ?? 0,
      removedHighlights: highlightPaths.length,
      removedAvatar: Boolean(avatarPath),
    },
  })

  revalidateTag('public-athletes')
  revalidateTag('public-ranking')

  return {
    ok: true,
    anonymisedRankings: payload.anonymisedRankings ?? 0,
    removedHighlights: highlightPaths.length,
  }
}
