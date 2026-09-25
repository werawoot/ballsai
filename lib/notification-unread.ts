export type UnreadBadge = { text: string; label: string }

const MAX_SHOWN = 99

export function unreadBadge(count: number | null | undefined): UnreadBadge | null {
  if (!count || count <= 0) return null
  return {
    text: count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count),
    label: `ยังไม่อ่าน ${count} รายการ`,
  }
}
