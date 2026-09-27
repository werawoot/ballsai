// The words for the count live in messages/*.json (nav.unread, notifications.unread).
export type UnreadBadge = { text: string; count: number }

const MAX_SHOWN = 99

export function unreadBadge(count: number | null | undefined): UnreadBadge | null {
  if (!count || count <= 0) return null
  return {
    text: count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count),
    count,
  }
}
