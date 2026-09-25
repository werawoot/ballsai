export type VenuePhotoModerationStatus = 'pending' | 'visible' | 'hidden'

export type OwnerPhotoRow = {
  id: string
  object_path: string
  caption: string
  sort_order: number
  is_cover: boolean
  moderation_status: VenuePhotoModerationStatus
  created_at: string
}

export type OwnerPhotoView = OwnerPhotoRow & {
  canMoveUp: boolean
  canMoveDown: boolean
  canSetCover: boolean
}

// SQL43 defaults every new row to 'pending' and only an admin can change it. The owner
// has to be able to see that their photo is not public yet.
const BADGES: Record<VenuePhotoModerationStatus, { label: string; hint: string; color: string; background: string }> = {
  pending: { label: 'รอตรวจสอบ', hint: 'ยังไม่แสดงต่อผู้เล่นจนกว่าทีมงานจะตรวจ', color: '#9a3412', background: '#fff7ed' },
  visible: { label: 'เผยแพร่แล้ว', hint: 'ผู้เล่นเห็นรูปนี้ในหน้าสนาม', color: '#166534', background: '#ecfdf5' },
  hidden: { label: 'ถูกซ่อน', hint: 'ทีมงานซ่อนรูปนี้ไว้ กรุณาติดต่อฝ่ายดูแล', color: '#b91c1c', background: '#fff1f1' },
}

export function moderationBadge(status: VenuePhotoModerationStatus) {
  return BADGES[status]
}

// Same ordering as venue_photos_venue_order_idx, so the screen matches the database.
export function ownerPhotoRows(photos: OwnerPhotoRow[]): OwnerPhotoView[] {
  const ordered = [...photos].sort((a, b) =>
    a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))

  return ordered.map((photo, index) => ({
    ...photo,
    canMoveUp: index > 0,
    canMoveDown: index < ordered.length - 1,
    canSetCover: !photo.is_cover,
  }))
}

// reorder_venue_photos_safely takes the full id list and rejects duplicates or a partial
// set, so a move returns the whole order or nothing at all.
export function movePhoto(rows: OwnerPhotoView[], photoId: string, direction: 'up' | 'down') {
  const index = rows.findIndex(row => row.id === photoId)
  if (index === -1) return null
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= rows.length) return null

  const ids = rows.map(row => row.id)
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  return ids
}
