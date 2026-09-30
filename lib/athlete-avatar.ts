import type { SupabaseClient } from '@supabase/supabase-js'

// T51. Athlete photos live in the private `athlete-avatars` bucket (sql/62). The database
// decides who may see one: the owner, an admin, or anyone when the athlete's profile is
// public (a public minor already has guardian consent, enforced by trigger). The app stores
// the object path in athlete_profiles.profile_image_url and shows a signed URL. Supabase
// signs only the paths the viewer's RLS can read; any other path gets no URL and the page
// shows no photo. Rows saved before sql/62 hold a public URL; the path is read out of it.
export const AVATAR_BUCKET = 'athlete-avatars'
// A photo stops loading at most this long after a profile is made private.
export const AVATAR_URL_SECONDS = 3600

const PUBLIC_MARKER = `/storage/v1/object/public/${AVATAR_BUCKET}/`
const OBJECT_PATH = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([A-Za-z0-9][A-Za-z0-9._-]*)$/

// The object path a stored value points at, or null when it is not an avatar object.
// With ownerId, only an object in that user's own folder counts.
export function avatarPath(value: string | null | undefined, ownerId?: string) {
  if (!value) return null
  let path = value
  const marker = value.indexOf(PUBLIC_MARKER)
  if (marker !== -1) {
    try { path = decodeURIComponent(value.slice(marker + PUBLIC_MARKER.length).split(/[?#]/)[0]) } catch { return null }
  }
  const match = OBJECT_PATH.exec(path)
  if (!match || match[2].includes('..')) return null
  if (ownerId && match[1] !== ownerId) return null
  return path
}

// Signed URLs for the photos on one page, keyed by the stored value. One request for the
// whole page. A refusal or a storage failure means no photo, never a broken page.
export async function signAvatarUrls(client: SupabaseClient, values: (string | null | undefined)[]) {
  const pathByValue = new Map<string, string>()
  for (const value of values) {
    const path = avatarPath(value)
    if (value && path) pathByValue.set(value, path)
  }
  const urls = new Map<string, string>()
  const paths = [...new Set(pathByValue.values())]
  if (!paths.length) return urls
  try {
    const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrls(paths, AVATAR_URL_SECONDS)
    if (error) throw error
    const signed = new Map((data ?? []).filter(item => item.signedUrl && !item.error).map(item => [item.path, item.signedUrl]))
    for (const [value, path] of pathByValue) {
      const url = signed.get(path)
      if (url) urls.set(value, url)
    }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'avatar_sign_failed', message: (error as Error)?.message ?? String(error) }))
  }
  return urls
}

// The same rows with profile_image_url replaced by a URL to show, or null.
export async function withAvatarUrls<T extends { profile_image_url?: string | null }>(client: SupabaseClient, rows: T[]) {
  const urls = await signAvatarUrls(client, rows.map(row => row.profile_image_url))
  return rows.map(row => ({ ...row, profile_image_url: (row.profile_image_url && urls.get(row.profile_image_url)) || null }))
}

// Every object in the athlete's own folder, for PDPA deletion: a replaced photo can still
// be there. Listed a page at a time so nothing is cut off; sub-folders (id null) skipped.
export async function ownAvatarPaths(client: SupabaseClient, userId: string) {
  const pageSize = 100
  const paths: string[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(AVATAR_BUCKET).list(userId, { limit: pageSize, offset })
    if (error) throw new Error(error.message)
    const items = data ?? []
    for (const item of items) if (item.id) paths.push(`${userId}/${item.name}`)
    if (items.length < pageSize) return paths
  }
}
