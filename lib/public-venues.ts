import type { SupabaseClient } from '@supabase/supabase-js'
import type { VenueCardCourt } from './venue-card-stats'

export const VENUES_PAGE_SIZE = 20

export type PublishedVenue = {
  id: string
  name: string
  province: string
  description: string
  amenities: string[]
  venue_courts: VenueCardCourt[] | null
}

// One page of published venues. It asks for one row more than a page so it can tell
// whether a next page exists without a count(*) over the whole table. Only open, future
// slots are embedded: the card counts nothing else, and a venue's past slots grow every
// week. The filter narrows the embedded rows, not the venues (no `!inner`), so a venue
// with no bookable slot still lists.
export async function fetchPublishedVenuesPage(client: SupabaseClient, { page, now = new Date() }: { page: number; now?: Date }) {
  const from = (page - 1) * VENUES_PAGE_SIZE
  const { data, error } = await client
    .from('venue_profiles')
    .select('id, name, province, description, amenities, venue_courts(id, name, sport, venue_slots(id, starts_at, price_baht, status))')
    .eq('is_published', true)
    .eq('venue_courts.venue_slots.status', 'open')
    .gt('venue_courts.venue_slots.starts_at', now.toISOString())
    .order('created_at', { ascending: false })
    // Ties on created_at have no defined order in Postgres; without a unique tiebreak a
    // row could appear on two pages or on none as the reader moves between them.
    .order('id', { ascending: true })
    .range(from, from + VENUES_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as unknown as PublishedVenue[]
  return { venues: rows.slice(0, VENUES_PAGE_SIZE), hasNext: rows.length > VENUES_PAGE_SIZE }
}
