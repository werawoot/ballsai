import { describe, expect, it } from 'vitest'
import { groupNotificationsByDay, notificationAge, notificationHref, notificationKind, parseNotificationFilter } from '@/lib/notification-feed'

describe('notification feed (/notifications)', () => {
  it('reads only "unread" as the unread tab; anything else is all', () => {
    expect(parseNotificationFilter('unread')).toBe('unread')
    for (const value of [undefined, '', 'read', 'UNREAD', ['x', 'unread']]) expect(parseNotificationFilter(value)).toBe('all')
    expect(parseNotificationFilter(['unread'])).toBe('unread')
  })

  it('draws every type the database allows, and a type it does not know yet as the plain bell', () => {
    const types = ['match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking', 'team_announcement', 'team_event_reminder', 'team_training_plan', 'hall_of_fame', 'organizer_request', 'organizer_decision', 'tournament_closed']
    for (const type of types) expect(notificationKind(type)).not.toBe('other')
    // sql/86: a Hall of Fame entry has its own picture, not the badge's.
    expect(notificationKind('hall_of_fame')).toBe('hall')
    // sql/89: organizer access news and a tournament closed on revocation.
    expect(notificationKind('organizer_decision')).toBe('organizer')
    expect(notificationKind('tournament_closed')).toBe('tournament')
    expect(notificationKind('something_new')).toBe('other')
    expect(notificationKind(null)).toBe('other')
  })

  it('groups newest-first rows by Bangkok day, so 23:30 UTC is already the next day', () => {
    const rows = [
      { id: 'a', created_at: '2026-10-12T05:00:00Z' },
      { id: 'b', created_at: '2026-10-11T18:00:00Z' }, // 01:00 on 12 Oct in Bangkok
      { id: 'c', created_at: '2026-10-11T16:00:00Z' }, // 23:00 on 11 Oct in Bangkok
      { id: 'd', created_at: '2026-10-02T03:00:00Z' },
    ]
    expect(groupNotificationsByDay(rows, '2026-10-12').map(group => [group.day, group.label, group.items.map(item => item.id).join('')])).toEqual([
      ['2026-10-12', 'today', 'ab'],
      ['2026-10-11', 'yesterday', 'c'],
      ['2026-10-02', 'date', 'd'],
    ])
    expect(groupNotificationsByDay(rows, '2026-10-01')[0].label).toBe('date')
    expect(groupNotificationsByDay([{ created_at: '2026-02-28T12:00:00Z' }], '2026-03-01')[0].label).toBe('yesterday')
  })

  it('says how long ago in the largest whole unit, and the time of day from a day old', () => {
    const now = new Date('2026-10-12T12:00:00Z')
    expect(notificationAge('2026-10-12T11:59:30Z', now)).toEqual({ unit: 'now' })
    expect(notificationAge('2026-10-12T11:15:00Z', now)).toEqual({ unit: 'minute', value: 45 })
    expect(notificationAge('2026-10-12T09:00:00Z', now)).toEqual({ unit: 'hour', value: 3 })
    expect(notificationAge('2026-10-11T12:30:00Z', now)).toEqual({ unit: 'hour', value: 23 })
    expect(notificationAge('2026-10-11T12:00:00Z', now)).toEqual({ unit: 'clock' })
    expect(notificationAge('2026-10-01T12:00:00Z', now)).toEqual({ unit: 'clock' })
  })

  it('follows links inside the site only', () => {
    expect(notificationHref('/team-members/abc')).toBe('/team-members/abc')
    for (const href of [null, '', 'https://evil.example', '//evil.example', 'javascript:alert(1)']) expect(notificationHref(href)).toBe('/notifications')
  })
})
