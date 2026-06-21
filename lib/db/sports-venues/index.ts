// Sports and Venues Module
// This file re-exports all types, constants, and query functions
// for convenient importing from a single location

// Export types
export * from './sports-venues-types'

// Export query functions. The database filter is aliased to avoid colliding
// with the in-memory filterVenues utility from sports-venues-types.
export {
  getAllSports,
  getSportById,
  getSportsWithVenueCount,
  searchSports,
  createSport,
  updateSport,
  deleteSport,
  getAllVenues,
  getVenueById,
  getVenuesBySport,
  getVenuesByProvince,
  getVenuesByCity,
  getVenuesWithSport,
  searchVenues,
  searchVenuesWithSport,
  filterVenues as filterVenuesFromDatabase,
  findVenuesNearby,
  createVenue,
  updateVenue,
  deleteVenue,
  getVenueSelectorData,
  getVenueNameById,
  getSportNameById,
  getVenueWithSportName,
  getVenuesByIds,
  getSportsByIds,
  getVenueStatistics,
  getVenuesByStatus,
  getVenuesByType,
} from './sports-venues-queries'

// Re-export commonly used constants for convenience
export {
  SPORT_TABLE,
  VENUE_TABLE,
  VENUE_WITH_SPORT_VIEW,
  SPORT_WITH_VENUE_COUNT_VIEW,
  VENUE_STATUS,
  VENUE_TYPES,
  SURFACE_TYPES,
  CAPACITY_RANGES,
} from './sports-venues-types'
