import { describe, expect, it, vi } from 'vitest'
import { fetchUnreadNotificationCount } from '@/lib/notification-count'

const client = (result: { count: number | null; error: unknown }) => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  })),
})

describe('fetchUnreadNotificationCount', () => {
  it('returns the unread count for the given user', async () => {
    await expect(fetchUnreadNotificationCount(client({ count: 3, error: null }), 'user-1')).resolves.toBe(3)
  })

  it('returns null when the query fails so the nav renders without a badge', async () => {
    await expect(fetchUnreadNotificationCount(client({ count: null, error: { code: '42P01' } }), 'user-1'))
      .resolves.toBeNull()
  })

  it('returns null without querying when there is no signed-in user', async () => {
    const supabase = client({ count: 5, error: null })

    await expect(fetchUnreadNotificationCount(supabase, null)).resolves.toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('treats a missing count as nothing unread rather than an error', async () => {
    await expect(fetchUnreadNotificationCount(client({ count: null, error: null }), 'user-1')).resolves.toBe(0)
  })
})
