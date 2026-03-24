// Supabase query helpers for Sports and Venues

import { createClient } from '@/lib/supabase'
import type {
  Sport,
  Venue,
  VenueWithSport,
  SportWithVenueCount,
  VenueSearchOptions,
  VenueSortOptions,
  VenueFilterOptions,
  Coordinate
} from './sports-venues-types'

const supabase = createClient()

// SPORT QUERIES
// =============

/**
 * Fetch all sports
 * @returns Array of all sports
 */
export async function getAllSports(): Promise<Sport[]> {
  const { data, error } = await supabase
    .from('sports')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching sports:', error)
    throw new Error(`Failed to fetch sports: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch a single sport by ID
 * @param sportId - The sport ID
 * @returns The sport object or null if not found
 */
export async function getSportById(sportId: number): Promise<Sport | null> {
  const { data, error } = await supabase
    .from('sports')
    .select('*')
    .eq('id', sportId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching sport:', error)
    throw new Error(`Failed to fetch sport: ${error.message}`)
  }

  return data
}

/**
 * Fetch sports with venue count using the view
 * @returns Array of sports with their venue counts
 */
export async function getSportsWithVenueCount(): Promise<SportWithVenueCount[]> {
  const { data, error } = await supabase
    .from('v_sports_with_venue_count')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching sports with venue count:', error)
    throw new Error(`Failed to fetch sports with venue count: ${error.message}`)
  }

  return data || []
}

/**
 * Search sports by name
 * @param query - The search query
 * @returns Array of matching sports
 */
export async function searchSports(query: string): Promise<Sport[]> {
  const { data, error } = await supabase
    .from('sports')
    .select('*')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error searching sports:', error)
    throw new Error(`Failed to search sports: ${error.message}`)
  }

  return data || []
}

/**
 * Create a new sport
 * @param sport - The sport data to insert
 * @returns The created sport
 */
export async function createSport(sport: { name: string }): Promise<Sport> {
  const { data, error } = await supabase
    .from('sports')
    .insert(sport)
    .select()
    .single()

  if (error) {
    console.error('Error creating sport:', error)
    throw new Error(`Failed to create sport: ${error.message}`)
  }

  return data
}

/**
 * Update an existing sport
 * @param sportId - The sport ID
 * @param updates - The fields to update
 * @returns The updated sport
 */
export async function updateSport(
  sportId: number,
  updates: { name: string }
): Promise<Sport> {
  const { data, error } = await supabase
    .from('sports')
    .update(updates)
    .eq('id', sportId)
    .select()
    .single()

  if (error) {
    console.error('Error updating sport:', error)
    throw new Error(`Failed to update sport: ${error.message}`)
  }

  return data
}

/**
 * Delete a sport
 * @param sportId - The sport ID
 * @returns Success status
 */
export async function deleteSport(sportId: number): Promise<void> {
  const { error } = await supabase
    .from('sports')
    .delete()
    .eq('id', sportId)

  if (error) {
    console.error('Error deleting sport:', error)
    throw new Error(`Failed to delete sport: ${error.message}`)
  }
}

// VENUE QUERIES
// ==============

/**
 * Fetch all venues
 * @param options - Optional sort options
 * @returns Array of all venues
 */
export async function getAllVenues(
  options?: VenueSortOptions
): Promise<Venue[]> {
  const query = supabase
    .from('venues')
    .select('*')

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('name', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching venues:', error)
    throw new Error(`Failed to fetch venues: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch a single venue by ID
 * @param venueId - The venue ID
 * @returns The venue object or null if not found
 */
export async function getVenueById(venueId: number): Promise<Venue | null> {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('id', venueId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching venue:', error)
    throw new Error(`Failed to fetch venue: ${error.message}`)
  }

  return data
}

/**
 * Fetch all venues for a specific sport
 * @param sportId - The sport ID
 * @param options - Optional sort options
 * @returns Array of venues for the specified sport
 */
export async function getVenuesBySport(
  sportId: number,
  options?: VenueSortOptions
): Promise<Venue[]> {
  const query = supabase
    .from('venues')
    .select('*')
    .eq('sport_id', sportId)

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('name', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching venues by sport:', error)
    throw new Error(`Failed to fetch venues by sport: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch all venues in a specific province
 * @param province - The province name
 * @param options - Optional sort options
 * @returns Array of venues in the specified province
 */
export async function getVenuesByProvince(
  province: string,
  options?: VenueSortOptions
): Promise<Venue[]> {
  const query = supabase
    .from('venues')
    .select('*')
    .eq('province', province)

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('name', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching venues by province:', error)
    throw new Error(`Failed to fetch venues by province: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch all venues in a specific city
 * @param city - The city name
 * @param options - Optional sort options
 * @returns Array of venues in the specified city
 */
export async function getVenuesByCity(
  city: string,
  options?: VenueSortOptions
): Promise<Venue[]> {
  const query = supabase
    .from('venues')
    .select('*')
    .eq('city', city)

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('name', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching venues by city:', error)
    throw new Error(`Failed to fetch venues by city: ${error.message}`)
  }

  return data || []
}

// COMBINED QUERIES
// ================

/**
 * Fetch venues with their sport information using the view
 * @param filters - Optional filters to apply
 * @param options - Optional sort options
 * @returns Array of venues with sport information
 */
export async function getVenuesWithSport(
  filters?: {
    sportId?: number
    province?: string
    status?: string
    venueType?: string
  },
  options?: VenueSortOptions
): Promise<VenueWithSport[]> {
  const query = supabase
    .from('v_venues_with_sport')
    .select('*')

  if (filters?.sportId !== undefined) {
    query.eq('sport_id', filters.sportId)
  }
  if (filters?.province) {
    query.eq('province', filters.province)
  }
  if (filters?.status) {
    query.eq('status', filters.status)
  }
  if (filters?.venueType) {
    query.eq('venue_type', filters.venueType)
  }

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('name', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching venues with sport:', error)
    throw new Error(`Failed to fetch venues with sport: ${error.message}`)
  }

  return data || []
}

/**
 * Search venues by name
 * @param options - Search options including query and field preferences
 * @returns Array of matching venues
 */
export async function searchVenues(
  options: VenueSearchOptions
): Promise<Venue[]> {
  const { query: searchQuery, language = 'both' } = options

  // Build the query based on language preference
  let supabaseQuery = supabase.from('venues').select('*')

  if (language === 'en') {
    supabaseQuery = supabaseQuery.or(
      `name.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,province.ilike.%${searchQuery}%,home_club.ilike.%${searchQuery}%`
    )
  } else if (language === 'th') {
    supabaseQuery = supabaseQuery.ilike('name_th', `%${searchQuery}%`)
  } else {
    // Search both English and Thai names
    supabaseQuery = supabaseQuery.or(
      `name.ilike.%${searchQuery}%,name_th.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,province.ilike.%${searchQuery}%,home_club.ilike.%${searchQuery}%`
    )
  }

  const { data, error } = await supabaseQuery.order('name', { ascending: true })

  if (error) {
    console.error('Error searching venues:', error)
    throw new Error(`Failed to search venues: ${error.message}`)
  }

  return data || []
}

/**
 * Search venues with sport information
 * @param options - Search options including query and language preference
 * @returns Array of matching venues with sport information
 */
export async function searchVenuesWithSport(
  options: VenueSearchOptions
): Promise<VenueWithSport[]> {
  const { query: searchQuery, language = 'both' } = options

  // Build the query based on language preference
  let supabaseQuery = supabase.from('v_venues_with_sport').select('*')

  if (language === 'en') {
    supabaseQuery = supabaseQuery.or(
      `name.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,province.ilike.%${searchQuery}%,home_club.ilike.%${searchQuery}%,sport_name.ilike.%${searchQuery}%`
    )
  } else if (language === 'th') {
    supabaseQuery = supabaseQuery.ilike('name_th', `%${searchQuery}%`)
  } else {
    // Search both English and Thai names
    supabaseQuery = supabaseQuery.or(
      `name.ilike.%${searchQuery}%,name_th.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,province.ilike.%${searchQuery}%,home_club.ilike.%${searchQuery}%,sport_name.ilike.%${searchQuery}%`
    )
  }

  const { data, error } = await supabaseQuery.order('name', { ascending: true })

  if (error) {
    console.error('Error searching venues with sport:', error)
    throw new Error(`Failed to search venues with sport: ${error.message}`)
  }

  return data || []
}

/**
 * Filter venues with multiple criteria
 * @param filters - Filter options
 * @param options - Optional sort options
 * @returns Array of matching venues
 */
export async function filterVenues(
  filters: VenueFilterOptions,
  options?: VenueSortOptions
): Promise<Venue[]> {
  let query = supabase.from('venues').select('*')

  // Apply filters
  if (filters.sportId !== undefined) {
    query = query.eq('sport_id', filters.sportId)
  }
  if (filters.province) {
    query = query.eq('province', filters.province)
  }
  if (filters.city) {
    query = query.eq('city', filters.city)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.venueType) {
    query = query.eq('venue_type', filters.venueType)
  }
  if (filters.surface) {
    query = query.eq('surface', filters.surface)
  }
  if (filters.minCapacity !== undefined) {
    query = query.gte('capacity', filters.minCapacity)
  }
  if (filters.maxCapacity !== undefined) {
    query = query.lte('capacity', filters.maxCapacity)
  }
  if (filters.minOpenedYear !== undefined) {
    query = query.gte('opened_year', filters.minOpenedYear)
  }
  if (filters.maxOpenedYear !== undefined) {
    query = query.lte('opened_year', filters.maxOpenedYear)
  }
  if (filters.homeClub) {
    query = query.ilike('home_club', `%${filters.homeClub}%`)
  }

  // Apply sorting
  if (options) {
    query = query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query = query.order('name', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error filtering venues:', error)
    throw new Error(`Failed to filter venues: ${error.message}`)
  }

  return data || []
}

/**
 * Find venues within a specified radius of a coordinate
 * Note: This fetches all venues and filters client-side. For large datasets,
 * consider using PostGIS for server-side spatial queries.
 * @param center - The center coordinate
 * @param radiusKm - The search radius in kilometers
 * @returns Array of venues within the radius with their distances
 */
export async function findVenuesNearby(
  center: Coordinate,
  radiusKm: number
): Promise<Array<{ venue: VenueWithSport; distance: number }>> {
  const venues = await getVenuesWithSport()

  return venues
    .map((venue) => ({
      venue,
      distance:
        venue.latitude && venue.longitude
          ? calculateDistance(
              { latitude: venue.latitude, longitude: venue.longitude },
              center
            )
          : Infinity,
    }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
}

/**
 * Create a new venue
 * @param venue - The venue data to insert
 * @returns The created venue
 */
export async function createVenue(
  venue: Omit<Venue, 'id' | 'created_at' | 'updated_at'>
): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues')
    .insert(venue)
    .select()
    .single()

  if (error) {
    console.error('Error creating venue:', error)
    throw new Error(`Failed to create venue: ${error.message}`)
  }

  return data
}

/**
 * Update an existing venue
 * @param venueId - The venue ID
 * @param updates - The fields to update
 * @returns The updated venue
 */
export async function updateVenue(
  venueId: number,
  updates: Partial<Omit<Venue, 'id' | 'created_at' | 'updated_at'>>
): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues')
    .update(updates)
    .eq('id', venueId)
    .select()
    .single()

  if (error) {
    console.error('Error updating venue:', error)
    throw new Error(`Failed to update venue: ${error.message}`)
  }

  return data
}

/**
 * Delete a venue
 * @param venueId - The venue ID
 * @returns Success status
 */
export async function deleteVenue(venueId: number): Promise<void> {
  const { error } = await supabase
    .from('venues')
    .delete()
    .eq('id', venueId)

  if (error) {
    console.error('Error deleting venue:', error)
    throw new Error(`Failed to delete venue: ${error.message}`)
  }
}

// UTILITY FUNCTIONS
// ==================

/**
 * Fetch all data needed for a venue selector dropdown
 * @returns Object with sports and provinces organized for UI usage
 */
export async function getVenueSelectorData() {
  const [sports, venues] = await Promise.all([
    getAllSports(),
    getAllVenues()
  ])

  // Get unique provinces
  const provinces = Array.from(
    new Set(venues.map(v => v.province).filter(Boolean))
  ).sort()

  // Group venues by province
  const venuesByProvince = provinces.map(province => ({
    province,
    venues: venues.filter(v => v.province === province)
  }))

  // Group venues by sport
  const venuesBySport = sports.map(sport => ({
    ...sport,
    venues: venues.filter(v => v.sport_id === sport.id)
  }))

  return {
    sports,
    provinces,
    venuesByProvince,
    venuesBySport,
    venues
  }
}

/**
 * Get venue name by ID (with language preference)
 * @param venueId - The venue ID
 * @param language - Language preference ('en' or 'th')
 * @returns Venue name or empty string if not found
 */
export async function getVenueNameById(
  venueId: number,
  language: 'en' | 'th' = 'en'
): Promise<string> {
  const venue = await getVenueById(venueId)
  if (!venue) return ''

  if (language === 'th' && venue.name_th) {
    return venue.name_th
  }
  return venue.name
}

/**
 * Get sport name by ID
 * @param sportId - The sport ID
 * @returns Sport name or empty string if not found
 */
export async function getSportNameById(sportId: number): Promise<string> {
  const sport = await getSportById(sportId)
  if (!sport) return ''
  return sport.name
}

/**
 * Get venue with sport name by ID
 * @param venueId - The venue ID
 * @returns Venue with sport information or null if not found
 */
export async function getVenueWithSportName(
  venueId: number
): Promise<VenueWithSport | null> {
  const { data, error } = await supabase
    .from('v_venues_with_sport')
    .select('*')
    .eq('id', venueId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching venue with sport:', error)
    throw new Error(`Failed to fetch venue with sport: ${error.message}`)
  }

  return data
}

// BATCH OPERATIONS
// ================

/**
 * Fetch multiple venues by their IDs
 * @param venueIds - Array of venue IDs
 * @returns Array of venues
 */
export async function getVenuesByIds(venueIds: number[]): Promise<Venue[]> {
  if (venueIds.length === 0) return []

  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .in('id', venueIds)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching venues by IDs:', error)
    throw new Error(`Failed to fetch venues by IDs: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch multiple sports by their IDs
 * @param sportIds - Array of sport IDs
 * @returns Array of sports
 */
export async function getSportsByIds(sportIds: number[]): Promise<Sport[]> {
  if (sportIds.length === 0) return []

  const { data, error } = await supabase
    .from('sports')
    .select('*')
    .in('id', sportIds)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching sports by IDs:', error)
    throw new Error(`Failed to fetch sports by IDs: ${error.message}`)
  }

  return data || []
}

// STATISTICS FUNCTIONS
// =====================

/**
 * Get venue statistics
 * @returns Object with various venue statistics
 */
export async function getVenueStatistics() {
  const [totalVenues, venuesByStatus, venuesByType, sportsWithCount] = await Promise.all([
    getAllVenues(),
    getVenuesByStatus(),
    getVenuesByType(),
    getSportsWithVenueCount()
  ])

  const totalCapacity = totalVenues.reduce((sum, v) => sum + (v.capacity || 0), 0)
  const avgCapacity = totalVenues.length > 0 ? totalCapacity / totalVenues.length : 0

  return {
    totalVenues: totalVenues.length,
    totalCapacity,
    avgCapacity,
    venuesByStatus,
    venuesByType,
    sportsWithCount
  }
}

/**
 * Get count of venues by status
 * @returns Array of objects with status and count
 */
export async function getVenuesByStatus(): Promise<Array<{ status: string; count: number }>> {
  const venues = await getAllVenues()

  const statusCounts = venues.reduce((acc, venue) => {
    const status = venue.status || 'unknown'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return Object.entries(statusCounts).map(([status, count]) => ({ status, count }))
}

/**
 * Get count of venues by type
 * @returns Array of objects with type and count
 */
export async function getVenuesByType(): Promise<Array<{ venue_type: string; count: number }>> {
  const venues = await getAllVenues()

  const typeCounts = venues.reduce((acc, venue) => {
    const type = venue.venue_type || 'unknown'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return Object.entries(typeCounts).map(([venue_type, count]) => ({ venue_type, count }))
}

// HELPER FUNCTION
// ===============

/**
 * Calculate distance between two coordinates using the Haversine formula
 * @param coord1 - First coordinate
 * @param coord2 - Second coordinate
 * @param unit - Distance unit ('km' or 'miles')
 * @returns Distance between the two coordinates
 */
function calculateDistance(
  coord1: Coordinate,
  coord2: Coordinate,
  unit: 'km' | 'miles' = 'km'
): number {
  const R = unit === 'km' ? 6371 : 3959 // Earth's radius in km or miles
  const dLat = toRad(coord2.latitude - coord1.latitude)
  const dLon = toRad(coord2.longitude - coord1.longitude)
  const lat1 = toRad(coord1.latitude)
  const lat2 = toRad(coord2.latitude)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}
