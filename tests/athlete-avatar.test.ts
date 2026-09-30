import { describe, expect, it } from 'vitest'
import { AVATAR_URL_SECONDS, avatarPath, ownAvatarPaths, signAvatarUrls, withAvatarUrls } from '@/lib/athlete-avatar'

// T51: athlete-avatars was a public bucket, so the photo of a minor whose profile is not
// public stayed readable by anyone holding the URL. SQL62 makes the bucket private and
// lets the database decide who may see a photo (owner, admin, or a public profile). The
// app stores the object path and shows a short-lived signed URL; Supabase refuses to sign
// a path the viewer's RLS cannot see, and the page then shows no photo.

const OWNER = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b'
const OTHER = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b'
const LEGACY = `https://hivedzrwrrcnjrlirhtv.supabase.co/storage/v1/object/public/athlete-avatars/${OWNER}/profile-1.jpg`

describe('which stored value is an avatar object', () => {
  it('reads a path, or the path inside an old public URL', () => {
    expect(avatarPath(`${OWNER}/profile-2.webp`)).toBe(`${OWNER}/profile-2.webp`)
    expect(avatarPath(LEGACY)).toBe(`${OWNER}/profile-1.jpg`)
    expect(avatarPath(`${LEGACY}?t=1`)).toBe(`${OWNER}/profile-1.jpg`)
  })

  it('ignores anything that is not an object in the avatar bucket', () => {
    expect(avatarPath(null)).toBeNull()
    expect(avatarPath('')).toBeNull()
    expect(avatarPath('https://example.com/me.jpg')).toBeNull()
    expect(avatarPath('../slips/x.jpg')).toBeNull()
    expect(avatarPath(`${OWNER}/../x.jpg`)).toBeNull()
    expect(avatarPath('not-a-user/x.jpg')).toBeNull()
  })

  it('can insist the object is in the owner\'s own folder', () => {
    expect(avatarPath(LEGACY, OWNER)).toBe(`${OWNER}/profile-1.jpg`)
    expect(avatarPath(LEGACY, OTHER)).toBeNull()
  })
})

// A stand-in for supabase.storage that behaves like signObjectUrls: one request for many
// paths, and an error (no URL) for any path the viewer's RLS does not allow.
function fakeStorage(visible: Set<string>) {
  const calls: { bucket: string; paths: string[]; seconds: number }[] = []
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], seconds: number) => {
          calls.push({ bucket, paths, seconds })
          return {
            data: paths.map(path => visible.has(path)
              ? { path, signedUrl: `https://cdn.test/sign/${bucket}/${path}?token=t`, error: null }
              : { path, signedUrl: null, error: 'Either the object does not exist or you do not have access to it' }),
            error: null,
          }
        },
      }),
    },
  }
  return { client: client as never, calls }
}

describe('signing the photos on a page', () => {
  it('signs every photo on a page in one request, for an hour at most', async () => {
    const { client, calls } = fakeStorage(new Set([`${OWNER}/profile-1.jpg`, `${OTHER}/a.png`]))
    const urls = await signAvatarUrls(client, [LEGACY, `${OTHER}/a.png`, LEGACY, null, 'https://example.com/x.jpg'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ bucket: 'athlete-avatars', paths: [`${OWNER}/profile-1.jpg`, `${OTHER}/a.png`], seconds: AVATAR_URL_SECONDS })
    expect(AVATAR_URL_SECONDS).toBeLessThanOrEqual(3600)
    expect(urls.get(LEGACY)).toMatch(/^https:\/\/cdn\.test\/sign\/athlete-avatars\//)
    expect(urls.get(`${OTHER}/a.png`)).toMatch(/token=/)
    expect(urls.has('https://example.com/x.jpg')).toBe(false)
  })

  it('shows no photo when the database refuses, and makes no request when there is nothing to sign', async () => {
    const { client, calls } = fakeStorage(new Set())
    expect((await signAvatarUrls(client, [LEGACY])).size).toBe(0)
    await signAvatarUrls(client, [null, undefined, ''])
    expect(calls).toHaveLength(1)
  })

  it('shows no photo, rather than failing the page, when storage is down', async () => {
    const client = { storage: { from: () => ({ createSignedUrls: async () => ({ data: null, error: { message: 'boom' } }) }) } }
    expect((await signAvatarUrls(client as never, [LEGACY])).size).toBe(0)
    const throwing = { storage: { from: () => ({ createSignedUrls: async () => { throw new Error('network') } }) } }
    expect((await signAvatarUrls(throwing as never, [LEGACY])).size).toBe(0)
  })

  it('replaces the stored value with a URL to show, or null', async () => {
    const { client } = fakeStorage(new Set([`${OWNER}/profile-1.jpg`]))
    const rows = await withAvatarUrls(client, [
      { user_id: OWNER, profile_image_url: LEGACY },
      { user_id: OTHER, profile_image_url: `${OTHER}/private.jpg` },
      { user_id: OTHER, profile_image_url: null },
    ])
    expect(rows[0].profile_image_url).toMatch(/^https:\/\/cdn\.test\/sign\//)
    expect(rows[1].profile_image_url).toBeNull()
    expect(rows[2].profile_image_url).toBeNull()
    expect(rows[0].user_id).toBe(OWNER)
  })
})

describe('every photo an athlete ever uploaded', () => {
  // PDPA deletion used to remove only the current photo; a replaced card photo stayed.
  it('lists the whole folder, page by page, with nothing capped', async () => {
    const files = Array.from({ length: 230 }, (_, i) => ({ id: `f${i}`, name: `card-${i}.jpg` }))
    const listed: { folder: string; limit: number; offset: number }[] = []
    const client = { storage: { from: () => ({ list: async (folder: string, { limit, offset }: { limit: number; offset: number }) => {
      listed.push({ folder, limit, offset })
      return { data: files.slice(offset, offset + limit), error: null }
    } }) } }
    const paths = await ownAvatarPaths(client as never, OWNER)
    expect(paths).toHaveLength(230)
    expect(new Set(paths).size).toBe(230)
    expect(paths[0]).toBe(`${OWNER}/card-0.jpg`)
    expect(listed.every(call => call.folder === OWNER)).toBe(true)
    expect(listed.length).toBeGreaterThan(1)
  })

  it('skips sub-folders and stops on an error', async () => {
    const client = { storage: { from: () => ({ list: async () => ({ data: [{ id: null, name: 'nested' }, { id: 'a', name: 'profile-1.jpg' }], error: null }) }) } }
    expect(await ownAvatarPaths(client as never, OWNER)).toEqual([`${OWNER}/profile-1.jpg`])
    const failing = { storage: { from: () => ({ list: async () => ({ data: null, error: { message: 'down' } }) }) } }
    await expect(ownAvatarPaths(failing as never, OWNER)).rejects.toThrow('down')
  })
})
