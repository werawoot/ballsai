export type VenueCardSlot = {
  id: string
  price_baht: number
  starts_at: string
  status: string
}

export type VenueCardCourt = {
  id: string
  name: string
  sport: string
  venue_slots: VenueCardSlot[] | null
}

export type VenueCardStats = {
  courtCount: number
  sports: string[]
  openSlotCount: number
  minPrice: number | null
  maxPrice: number | null
  priceLabel: string | null
}

const SPORT_LABEL: Record<string, string> = { football: 'ฟุตบอล', futsal: 'ฟุตซอล' }

// SQL40 made 'reserved' distinct from 'blocked'. Only an 'open' slot in the future is
// actually bookable, so the price range and the count must both use that set: showing a
// price from a past or reserved slot would promise something the flow will refuse.
export function venueCardStats(courts: VenueCardCourt[] | null | undefined, now = new Date()): VenueCardStats {
  const all = courts ?? []
  const bookable = all
    .flatMap(court => court.venue_slots ?? [])
    .filter(slot => slot.status === 'open' && new Date(slot.starts_at) > now)

  const prices = bookable.map(slot => slot.price_baht)
  const minPrice = prices.length > 0 ? Math.min(...prices) : null
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null

  const sports: string[] = []
  for (const court of all) {
    const label = SPORT_LABEL[court.sport] ?? court.sport
    if (!sports.includes(label)) sports.push(label)
  }

  return {
    courtCount: all.length,
    sports,
    openSlotCount: bookable.length,
    minPrice,
    maxPrice,
    priceLabel: minPrice === null || maxPrice === null
      ? null
      : minPrice === maxPrice
        ? `฿${minPrice.toLocaleString('th-TH')}`
        : `฿${minPrice.toLocaleString('th-TH')}–${maxPrice.toLocaleString('th-TH')}`,
  }
}
