export type VenueSlotStatus = 'open' | 'reserved' | 'blocked'

export type OwnerSlot = {
  id: string
  starts_at: string
  ends_at: string
  price_baht: number
  status: VenueSlotStatus
}

export type OwnerCourt = {
  name: string
  venueName: string
  venue_slots: OwnerSlot[] | null
}

export type OwnerSlotRow = OwnerSlot & {
  courtName: string
  venueName: string
  canClose: boolean
}

// SQL40 distinguishes a booking-reserved slot from one the owner closed. The owner
// needs to see both live states; only an unbooked slot can still be closed. The status
// is worded by the page (venueOwner.openSlots.status.<status>).
export function ownerManageableSlots(courts: OwnerCourt[]): OwnerSlotRow[] {
  return courts
    .flatMap(court => (court.venue_slots ?? [])
      .filter(slot => slot.status === 'open' || slot.status === 'reserved')
      .map(slot => ({
        ...slot,
        courtName: court.name,
        venueName: court.venueName,
        canClose: slot.status === 'open',
      })))
    .sort((a, b) => new Date(a.starts_at).valueOf() - new Date(b.starts_at).valueOf())
}
