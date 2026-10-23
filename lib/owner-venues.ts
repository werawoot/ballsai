import type { SupabaseClient } from '@supabase/supabase-js'

// T61. A venue owner's venues for /venue, with each court's slots from a week back onward.
// Slots are created ahead in bulk and never deleted, so reading every slot ever made grew the
// page with every week a venue was open. A week back keeps recent days in the day view; the
// per-court cap keeps a court with months of slots created ahead to one bounded read.
// Ordered by (court_id, starts_at), which venue_slots_court_time_idx (sql/23) serves for open
// slots. RLS limits venue_profiles to the owner's own rows; the owner filter says so too.
export const OWNER_SLOT_DAYS_BACK = 7
export const OWNER_SLOTS_PER_COURT = 200

const COLUMNS = 'id, name, province, address, contact_phone, description, amenities, venue_courts(id, name, sport, surface, capacity, venue_slots(id, starts_at, ends_at, price_baht, status))'

export async function fetchOwnerVenues(client: SupabaseClient, ownerId: string, now = new Date()) {
  const since = new Date(now.valueOf() - OWNER_SLOT_DAYS_BACK * 24 * 3600 * 1000).toISOString()
  const { data, error } = await client.from('venue_profiles')
    .select(COLUMNS)
    .eq('owner_id', ownerId)
    .gte('venue_courts.venue_slots.starts_at', since)
    .order('created_at', { ascending: false })
    .order('starts_at', { ascending: true, referencedTable: 'venue_courts.venue_slots' })
    .limit(OWNER_SLOTS_PER_COURT, { referencedTable: 'venue_courts.venue_slots' })
  return { venues: data ?? [], error }
}
