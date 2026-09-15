import { describe, expect, it } from 'vitest'
import {
  ownerManageableSlots,
  venueSlotStatusLabel,
  type OwnerCourt,
} from '@/lib/venue-slot-status'

const court = (slots: OwnerCourt['venue_slots']): OwnerCourt => ({
  name: 'สนาม A',
  venueName: 'BallDoenSai Arena',
  venue_slots: slots,
})

const slot = (id: string, status: 'open' | 'reserved' | 'blocked', startsAt: string) => ({
  id,
  status,
  starts_at: startsAt,
  ends_at: startsAt,
  price_baht: 800,
})

describe('venue slot status', () => {
  it('names every slot status in Thai', () => {
    expect(venueSlotStatusLabel('open')).toBe('เปิดรับจอง')
    expect(venueSlotStatusLabel('reserved')).toBe('มีคำขอจอง')
    expect(venueSlotStatusLabel('blocked')).toBe('ปิดแล้ว')
  })

  it('keeps a reserved slot visible to its owner instead of hiding it', () => {
    const rows = ownerManageableSlots([
      court([
        slot('s1', 'open', '2026-10-01T10:00:00Z'),
        slot('s2', 'reserved', '2026-10-02T10:00:00Z'),
      ]),
    ])

    expect(rows.map(row => row.id)).toEqual(['s1', 's2'])
    expect(rows[1].statusLabel).toBe('มีคำขอจอง')
  })

  it('only lets the owner close a slot that has no active booking', () => {
    const rows = ownerManageableSlots([
      court([
        slot('s1', 'open', '2026-10-01T10:00:00Z'),
        slot('s2', 'reserved', '2026-10-02T10:00:00Z'),
      ]),
    ])

    expect(rows.find(row => row.id === 's1')?.canClose).toBe(true)
    expect(rows.find(row => row.id === 's2')?.canClose).toBe(false)
  })

  it('drops slots the owner already closed', () => {
    const rows = ownerManageableSlots([
      court([slot('s3', 'blocked', '2026-10-03T10:00:00Z')]),
    ])

    expect(rows).toEqual([])
  })

  it('orders slots by start time across every court', () => {
    const rows = ownerManageableSlots([
      court([slot('late', 'open', '2026-10-05T10:00:00Z')]),
      court([slot('early', 'reserved', '2026-10-01T10:00:00Z')]),
    ])

    expect(rows.map(row => row.id)).toEqual(['early', 'late'])
  })

  it('tolerates a court with no slot rows', () => {
    expect(ownerManageableSlots([{ name: 'A', venueName: 'V', venue_slots: null }])).toEqual([])
  })
})
