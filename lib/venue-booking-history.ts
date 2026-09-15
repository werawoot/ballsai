export type VenueBookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled'

type LegacyVenueSlot = {
  starts_at: string
  ends_at: string
  price_baht: number
  venue_courts: {
    name: string
    venue_profiles: { name: string } | null
  } | null
} | null

export type VenueBookingHistoryRow = {
  id: string
  status: VenueBookingStatus
  purpose: string
  note: string
  requested_at: string
  venue_name_snapshot?: string | null
  court_name_snapshot?: string | null
  slot_starts_at_snapshot?: string | null
  slot_ends_at_snapshot?: string | null
  price_baht_snapshot?: number | null
  venue_slots?: LegacyVenueSlot
}

export type VenueBookingHistoryItem = {
  id: string
  status: VenueBookingStatus
  purpose: string
  note: string
  requestedAt: string
  venueName: string
  courtName: string
  startsAt: string | null
  endsAt: string | null
  priceBaht: number | null
}

export const VENUE_BOOKING_SNAPSHOT_SELECT = [
  'id',
  'status',
  'purpose',
  'note',
  'requested_at',
  'venue_name_snapshot',
  'court_name_snapshot',
  'slot_starts_at_snapshot',
  'slot_ends_at_snapshot',
  'price_baht_snapshot',
].join(', ')

export const VENUE_BOOKING_LEGACY_SELECT =
  'id, status, purpose, note, requested_at, venue_slots(starts_at, ends_at, price_baht, venue_courts(name, venue_profiles(name)))'

export function isMissingBookingSnapshotError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703'
    || error.code === 'PGRST204'
    || Boolean(error.message?.includes('_snapshot'))
}

export function toVenueBookingHistoryItem(row: VenueBookingHistoryRow): VenueBookingHistoryItem {
  const slot = row.venue_slots ?? null
  return {
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    note: row.note,
    requestedAt: row.requested_at,
    venueName: row.venue_name_snapshot ?? slot?.venue_courts?.venue_profiles?.name ?? 'สนาม',
    courtName: row.court_name_snapshot ?? slot?.venue_courts?.name ?? '',
    startsAt: row.slot_starts_at_snapshot ?? slot?.starts_at ?? null,
    endsAt: row.slot_ends_at_snapshot ?? slot?.ends_at ?? null,
    priceBaht: row.price_baht_snapshot ?? slot?.price_baht ?? null,
  }
}
