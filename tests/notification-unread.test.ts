import { describe, expect, it } from 'vitest'
import { unreadBadge } from '@/lib/notification-unread'

describe('unreadBadge', () => {
  it('hides the badge when nothing is unread', () => {
    expect(unreadBadge(0)).toBeNull()
    expect(unreadBadge(null)).toBeNull()
    expect(unreadBadge(undefined)).toBeNull()
  })

  it('shows the exact count while it stays short', () => {
    expect(unreadBadge(1)).toEqual({ text: '1', label: 'ยังไม่อ่าน 1 รายการ' })
    expect(unreadBadge(99)).toEqual({ text: '99', label: 'ยังไม่อ่าน 99 รายการ' })
  })

  it('caps the text so the badge cannot stretch the nav', () => {
    expect(unreadBadge(100)?.text).toBe('99+')
    expect(unreadBadge(4321)?.text).toBe('99+')
  })

  it('ignores a negative count instead of rendering it', () => {
    expect(unreadBadge(-3)).toBeNull()
  })
})
