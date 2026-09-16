import { describe, expect, it } from 'vitest'
import {
  moderationBadge,
  movePhoto,
  ownerPhotoRows,
  type OwnerPhotoRow,
} from '@/lib/venue-photo-manager'

const row = (id: string, order: number, cover = false, status: OwnerPhotoRow['moderation_status'] = 'pending'): OwnerPhotoRow =>
  ({ id, object_path: `v/${id}.webp`, caption: '', sort_order: order, is_cover: cover, moderation_status: status, created_at: '2026-10-01T00:00:00.000Z' })

describe('moderationBadge', () => {
  it('names each moderation state in Thai', () => {
    expect(moderationBadge('pending').label).toBe('รอตรวจสอบ')
    expect(moderationBadge('visible').label).toBe('เผยแพร่แล้ว')
    expect(moderationBadge('hidden').label).toBe('ถูกซ่อน')
  })

  it('tells the owner a pending photo is not public yet', () => {
    expect(moderationBadge('pending').hint).toContain('ยังไม่แสดง')
  })

  it('gives each state a distinct colour so they are not confusable', () => {
    const colours = (['pending', 'visible', 'hidden'] as const).map(s => moderationBadge(s).color)
    expect(new Set(colours).size).toBe(3)
  })
})

describe('ownerPhotoRows', () => {
  it('orders by sort_order then created_at, matching the SQL43 index', () => {
    expect(ownerPhotoRows([row('c', 2), row('a', 0), row('b', 1)]).map(r => r.id))
      .toEqual(['a', 'b', 'c'])
  })

  it('marks the first and last row so the move buttons can be disabled', () => {
    const rows = ownerPhotoRows([row('a', 0), row('b', 1), row('c', 2)])

    expect(rows[0].canMoveUp).toBe(false)
    expect(rows[0].canMoveDown).toBe(true)
    expect(rows[2].canMoveUp).toBe(true)
    expect(rows[2].canMoveDown).toBe(false)
  })

  it('never offers "set as cover" for the photo that is already the cover', () => {
    const rows = ownerPhotoRows([row('a', 0, true), row('b', 1)])

    expect(rows[0].canSetCover).toBe(false)
    expect(rows[1].canSetCover).toBe(true)
  })

  it('tolerates an empty list', () => {
    expect(ownerPhotoRows([])).toEqual([])
  })

  it('leaves a single photo with no move affordance at all', () => {
    const rows = ownerPhotoRows([row('only', 0, true)])

    expect(rows[0].canMoveUp).toBe(false)
    expect(rows[0].canMoveDown).toBe(false)
  })
})

describe('movePhoto', () => {
  const rows = ownerPhotoRows([row('a', 0), row('b', 1), row('c', 2)])

  it('returns the id order the reorder rpc expects', () => {
    expect(movePhoto(rows, 'c', 'up')).toEqual(['a', 'c', 'b'])
    expect(movePhoto(rows, 'a', 'down')).toEqual(['b', 'a', 'c'])
  })

  it('returns null at the edges so no pointless request is sent', () => {
    expect(movePhoto(rows, 'a', 'up')).toBeNull()
    expect(movePhoto(rows, 'c', 'down')).toBeNull()
  })

  it('returns null for an id that is not in the list', () => {
    expect(movePhoto(rows, 'ghost', 'up')).toBeNull()
  })

  it('keeps every id exactly once so the rpc duplicate check cannot trip', () => {
    const next = movePhoto(rows, 'b', 'up')

    expect(next).not.toBeNull()
    expect(new Set(next!).size).toBe(rows.length)
    expect([...next!].sort()).toEqual(['a', 'b', 'c'])
  })
})
