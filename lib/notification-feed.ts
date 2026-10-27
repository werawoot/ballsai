import { bangkokToday } from '@/lib/public-tournaments'

// The /notifications page: one page of a person's own notifications, newest first, read
// one page at a time (never capped), grouped by Bangkok day, and drawn by what kind of
// news it is. The words live in messages/*.json (notifications.*).

export const NOTIFICATION_PAGE_SIZE = 30

export type NotificationFilter = 'all' | 'unread'

export function parseNotificationFilter(value: string | string[] | undefined): NotificationFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'unread' ? 'unread' : 'all'
}

// Which picture a notification gets. A type this build does not know yet (a newer SQL
// file can add one) falls back to the plain bell rather than guessing.
export type NotificationKind = 'result' | 'badge' | 'hall' | 'team' | 'family' | 'venue' | 'news' | 'event' | 'training' | 'organizer' | 'tournament' | 'other'

const KINDS: Record<string, NotificationKind> = {
  match_result: 'result',
  badge_earned: 'badge',
  team_status: 'team',
  team_invite: 'team',
  guardian_link: 'family',
  venue_booking: 'venue',
  team_announcement: 'news',
  team_event_reminder: 'event',
  team_training_plan: 'training',
  hall_of_fame: 'hall',
  // sql/89 (ADR-013): organizer requests and decisions, and a tournament closed on revocation.
  organizer_request: 'organizer',
  organizer_decision: 'organizer',
  tournament_closed: 'tournament',
}

export function notificationKind(type: string | null | undefined): NotificationKind {
  return (type && KINDS[type]) || 'other'
}

// The Bangkok calendar day of a timestamp, YYYY-MM-DD.
export function bangkokDay(iso: string): string {
  return bangkokToday(new Date(iso))
}

function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export type NotificationDayGroup<T> = { day: string; label: 'today' | 'yesterday' | 'date'; items: T[] }

// Groups rows that are already newest first into Bangkok days, keeping their order.
export function groupNotificationsByDay<T extends { created_at: string }>(items: T[], today: string): NotificationDayGroup<T>[] {
  const yesterday = previousDay(today)
  const groups: NotificationDayGroup<T>[] = []
  for (const item of items) {
    const day = bangkokDay(item.created_at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) { last.items.push(item); continue }
    groups.push({ day, label: day === today ? 'today' : day === yesterday ? 'yesterday' : 'date', items: [item] })
  }
  return groups
}

// "How long ago" in the largest whole unit, for the reader's own wording. From a day old
// it shows the time of day instead: the day heading already names the date.
export type NotificationAge = { unit: 'now' } | { unit: 'minute' | 'hour'; value: number } | { unit: 'clock' }

export function notificationAge(iso: string, now = new Date()): NotificationAge {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return { unit: 'now' }
  if (minutes < 60) return { unit: 'minute', value: minutes }
  if (minutes < 24 * 60) return { unit: 'hour', value: Math.floor(minutes / 60) }
  return { unit: 'clock' }
}

// Only links inside this site are followed; anything else stays on /notifications.
export function notificationHref(href: string | null | undefined): string {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : '/notifications'
}
