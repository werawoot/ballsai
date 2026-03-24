// Types and utilities for Sports and Venues

// Sport types
export interface Sport {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export type SportInsert = Omit<Sport, "id" | "created_at" | "updated_at">;
export type SportUpdate = Partial<Pick<Sport, "name">>;

// Venue types
export interface Venue {
  id: number;
  name: string;
  name_th: string | null;
  city: string | null;
  province: string | null;
  capacity: number | null;
  venue_type: string | null;
  surface: string | null;
  opened_year: number | null;
  home_club: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  sport_id: number | null;
  created_at: string;
  updated_at: string;
}

export type VenueInsert = Omit<
  Venue,
  "id" | "created_at" | "updated_at"
>;
export type VenueUpdate = Partial<
  Pick<
    Venue,
    | "name"
    | "name_th"
    | "city"
    | "province"
    | "capacity"
    | "venue_type"
    | "surface"
    | "opened_year"
    | "home_club"
    | "latitude"
    | "longitude"
    | "status"
    | "sport_id"
  >
>;

// View types
export interface VenueWithSport {
  id: number;
  name: string;
  name_th: string | null;
  city: string | null;
  province: string | null;
  capacity: number | null;
  venue_type: string | null;
  surface: string | null;
  opened_year: number | null;
  home_club: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  sport_id: number | null;
  sport_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SportWithVenueCount {
  id: number;
  name: string;
  venue_count: number;
  created_at: string;
  updated_at: string;
}

// Table names
export const SPORT_TABLE = "sports" as const;
export const VENUE_TABLE = "venues" as const;

// View names
export const VENUE_WITH_SPORT_VIEW = "v_venues_with_sport" as const;
export const SPORT_WITH_VENUE_COUNT_VIEW = "v_sports_with_venue_count" as const;

// Venue status constants
export const VENUE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  UNDER_CONSTRUCTION: "under_construction",
  RENOVATION: "renovation",
  DEMOLISHED: "demolished",
  TEMPORARILY_CLOSED: "temporarily_closed",
} as const;

export type VenueStatus = keyof typeof VENUE_STATUS;

// Venue type constants
export const VENUE_TYPES = {
  STADIUM: "stadium",
  ARENA: "arena",
  COURT: "court",
  FIELD: "field",
  POOL: "pool",
  TRACK: "track",
  HALL: "hall",
  COMPLEX: "complex",
} as const;

export type VenueType = keyof typeof VENUE_TYPES;

// Surface type constants
export const SURFACE_TYPES = {
  GRASS: "grass",
  SYNTHETIC: "synthetic",
  ARTIFICIAL_TURF: "artificial_turf",
  HARD_COURT: "hard_court",
  CLAY: "clay",
  WOOD: "wood",
  INDOOR_SYNTHETIC: "indoor_synthetic",
  WATER: "water",
  TRACK_SYNTHETIC: "track_synthetic",
  TARTAN: "tartan",
} as const;

export type SurfaceType = keyof typeof SURFACE_TYPES;

// Helper functions
export function isValidVenueStatus(status: string): status is VenueStatus {
  return Object.values(VENUE_STATUS).includes(status as VenueStatus);
}

export function isValidVenueType(type: string): type is VenueType {
  return Object.values(VENUE_TYPES).includes(type as VenueType);
}

export function isValidSurfaceType(surface: string): surface is SurfaceType {
  return Object.values(SURFACE_TYPES).includes(surface as SurfaceType);
}

export function getVenueStatusDisplayName(status: VenueStatus): string {
  const displayNames: Record<VenueStatus, string> = {
    active: "Active",
    inactive: "Inactive",
    under_construction: "Under Construction",
    renovation: "Under Renovation",
    demolished: "Demolished",
    temporarily_closed: "Temporarily Closed",
  };
  return displayNames[status];
}

export function getVenueTypeDisplayName(type: VenueType): string {
  const displayNames: Record<VenueType, string> = {
    stadium: "Stadium",
    arena: "Arena",
    court: "Court",
    field: "Field",
    pool: "Pool",
    track: "Track",
    hall: "Hall",
    complex: "Complex",
  };
  return displayNames[type];
}

// Validation functions
export function isLatitudeValid(latitude: number): boolean {
  return latitude >= -90 && latitude <= 90;
}

export function isLongitudeValid(longitude: number): boolean {
  return longitude >= -180 && longitude <= 180;
}

export function isOpenedYearValid(year: number): boolean {
  const currentYear = new Date().getFullYear();
  return year >= 1800 && year <= currentYear + 10; // Allow up to 10 years in the future
}

export function isCapacityValid(capacity: number): boolean {
  return capacity >= 0 && capacity <= 1000000; // Reasonable upper limit
}

// Query builder helpers
export function buildVenueWithSportQuery(filters?: {
  sportId?: number;
  province?: string;
  status?: VenueStatus;
  venueType?: VenueType;
}): string {
  let query = `
    SELECT
      v.id,
      v.name,
      v.name_th,
      v.city,
      v.province,
      v.capacity,
      v.venue_type,
      v.surface,
      v.opened_year,
      v.home_club,
      v.latitude,
      v.longitude,
      v.status,
      v.sport_id,
      s.name AS sport_name,
      v.created_at,
      v.updated_at
    FROM venues v
    LEFT JOIN sports s ON v.sport_id = s.id
  `;

  const conditions: string[] = [];

  if (filters?.sportId) {
    conditions.push(`v.sport_id = ${filters.sportId}`);
  }
  if (filters?.province) {
    conditions.push(`v.province = '${filters.province}'`);
  }
  if (filters?.status) {
    conditions.push(`v.status = '${filters.status}'`);
  }
  if (filters?.venueType) {
    conditions.push(`v.venue_type = '${filters.venueType}'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  return query;
}

export function buildSportWithVenueCountQuery(): string {
  return `
    SELECT
      s.id,
      s.name,
      COUNT(v.id) AS venue_count,
      s.created_at,
      s.updated_at
    FROM sports s
    LEFT JOIN venues v ON s.id = v.sport_id
    GROUP BY s.id, s.name, s.created_at, s.updated_at
    ORDER BY s.name
  `;
}

// Sort options for venues
export interface VenueSortOptions {
  field:
    | "name"
    | "name_th"
    | "city"
    | "province"
    | "capacity"
    | "opened_year"
    | "status";
  order: "asc" | "desc";
}

export function sortVenues(
  venues: Venue[],
  options: VenueSortOptions = { field: "name", order: "asc" },
): Venue[] {
  return [...venues].sort((a, b) => {
    const aVal = a[options.field];
    const bVal = b[options.field];

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === "number" && typeof bVal === "number") {
      return options.order === "asc" ? aVal - bVal : bVal - aVal;
    }

    const comparison = String(aVal).localeCompare(String(bVal));
    return options.order === "asc" ? comparison : -comparison;
  });
}

// Search utilities
export interface VenueSearchOptions {
  query: string;
  fields?: Array<"name" | "name_th" | "city" | "province" | "home_club">;
  language?: "en" | "th" | "both";
}

export function searchVenues(
  venues: Venue[],
  options: VenueSearchOptions,
): Venue[] {
  const { query, fields = ["name", "name_th"], language = "both" } = options;
  const lowerQuery = query.toLowerCase();

  return venues.filter((v) => {
    for (const field of fields) {
      const value = v[field];
      if (value === null) continue;

      if (field === "name_th" || field === "name_th") {
        if ((language === "th" || language === "both") &&
            value.includes(query)) {
          return true;
        }
      } else {
        if ((language === "en" || language === "both") &&
            String(value).toLowerCase().includes(lowerQuery)) {
          return true;
        }
      }
    }
    return false;
  });
}

// Geographic utilities
export interface Coordinate {
  latitude: number;
  longitude: number;
}

export function calculateDistance(
  coord1: Coordinate,
  coord2: Coordinate,
  unit: "km" | "miles" = "km",
): number {
  const R = unit === "km" ? 6371 : 3959; // Earth's radius in km or miles
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);
  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function findVenuesNearby(
  venues: Venue[],
  center: Coordinate,
  radiusKm: number,
): Array<{ venue: Venue; distance: number }> {
  return venues
    .map((venue) => ({
      venue,
      distance:
        venue.latitude && venue.longitude
          ? calculateDistance(
              { latitude: venue.latitude, longitude: venue.longitude },
              center,
            )
          : Infinity,
    }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

// Capacity categorization
export interface CapacityRange {
  min: number;
  max: number;
  label: string;
}

export const CAPACITY_RANGES: CapacityRange[] = [
  { min: 0, max: 1000, label: "Small (0-1,000)" },
  { min: 1001, max: 10000, label: "Medium (1,001-10,000)" },
  { min: 10001, max: 50000, label: "Large (10,001-50,000)" },
  { min: 50001, max: 100000, label: "Very Large (50,001-100,000)" },
  { min: 100001, max: Infinity, label: "Mega (100,000+)" },
];

export function getCapacityRange(capacity: number): string | null {
  if (!capacity) return null;
  for (const range of CAPACITY_RANGES) {
    if (capacity >= range.min && capacity <= range.max) {
      return range.label;
    }
  }
  return null;
}

// Filter utilities
export interface VenueFilterOptions {
  sportId?: number;
  province?: string;
  city?: string;
  status?: VenueStatus;
  venueType?: VenueType;
  surface?: SurfaceType;
  minCapacity?: number;
  maxCapacity?: number;
  minOpenedYear?: number;
  maxOpenedYear?: number;
  homeClub?: string;
}

export function filterVenues(
  venues: Venue[],
  filters: VenueFilterOptions,
): Venue[] {
  return venues.filter((v) => {
    if (filters.sportId !== undefined && v.sport_id !== filters.sportId)
      return false;
    if (filters.province && v.province !== filters.province) return false;
    if (filters.city && v.city !== filters.city) return false;
    if (filters.status && v.status !== filters.status) return false;
    if (filters.venueType && v.venue_type !== filters.venueType) return false;
    if (filters.surface && v.surface !== filters.surface) return false;
    if (filters.minCapacity !== undefined && (!v.capacity || v.capacity < filters.minCapacity))
      return false;
    if (filters.maxCapacity !== undefined && (!v.capacity || v.capacity > filters.maxCapacity))
      return false;
    if (filters.minOpenedYear !== undefined && (!v.opened_year || v.opened_year < filters.minOpenedYear))
      return false;
    if (filters.maxOpenedYear !== undefined && (!v.opened_year || v.opened_year > filters.maxOpenedYear))
      return false;
    if (filters.homeClub && (!v.home_club || !v.home_club.toLowerCase().includes(filters.homeClub.toLowerCase())))
      return false;

    return true;
  });
}

// Export all types for convenience
export type {
  Sport,
  SportInsert,
  SportUpdate,
  Venue,
  VenueInsert,
  VenueUpdate,
  VenueWithSport,
  SportWithVenueCount,
};
