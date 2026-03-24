// Supabase query helpers for Thailand Regions and Provinces

import { createClient } from '@/lib/supabase'
import type {
  Region,
  Province,
  ProvinceWithRegion,
  RegionWithProvinceCount,
  ProvinceSearchOptions,
  ProvinceSortOptions
} from './thailand-types'

const supabase = createClient()

// REGION QUERIES
// ==============

/**
 * Fetch all regions
 * @returns Array of all Thailand regions
 */
export async function getAllRegions(): Promise<Region[]> {
  const { data, error } = await supabase
    .from('region')
    .select('*')
    .order('region_id', { ascending: true })

  if (error) {
    console.error('Error fetching regions:', error)
    throw new Error(`Failed to fetch regions: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch a single region by ID
 * @param regionId - The region ID
 * @returns The region object or null if not found
 */
export async function getRegionById(regionId: number): Promise<Region | null> {
  const { data, error } = await supabase
    .from('region')
    .select('*')
    .eq('region_id', regionId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Row not found
      return null
    }
    console.error('Error fetching region:', error)
    throw new Error(`Failed to fetch region: ${error.message}`)
  }

  return data
}

/**
 * Fetch regions with province count using the view
 * @returns Array of regions with their province counts
 */
export async function getRegionsWithProvinceCount(): Promise<RegionWithProvinceCount[]> {
  const { data, error } = await supabase
    .from('v_region_with_province_count')
    .select('*')
    .order('region_id', { ascending: true })

  if (error) {
    console.error('Error fetching regions with province count:', error)
    throw new Error(`Failed to fetch regions with province count: ${error.message}`)
  }

  return data || []
}

// PROVINCE QUERIES
// ================

/**
 * Fetch all provinces
 * @param options - Optional sort options
 * @returns Array of all Thailand provinces
 */
export async function getAllProvinces(
  options?: ProvinceSortOptions
): Promise<Province[]> {
  const query = supabase
    .from('province')
    .select('*')

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('province_id', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching provinces:', error)
    throw new Error(`Failed to fetch provinces: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch a single province by ID
 * @param provinceId - The province ID
 * @returns The province object or null if not found
 */
export async function getProvinceById(provinceId: number): Promise<Province | null> {
  const { data, error } = await supabase
    .from('province')
    .select('*')
    .eq('province_id', provinceId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Row not found
      return null
    }
    console.error('Error fetching province:', error)
    throw new Error(`Failed to fetch province: ${error.message}`)
  }

  return data
}

/**
 * Fetch all provinces in a specific region
 * @param regionId - The region ID
 * @param options - Optional sort options
 * @returns Array of provinces in the specified region
 */
export async function getProvincesByRegion(
  regionId: number,
  options?: ProvinceSortOptions
): Promise<Province[]> {
  const query = supabase
    .from('province')
    .select('*')
    .eq('region_id', regionId)

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('province_name_en', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching provinces by region:', error)
    throw new Error(`Failed to fetch provinces by region: ${error.message}`)
  }

  return data || []
}

// COMBINED QUERIES
// ================

/**
 * Fetch provinces with their region information using the view
 * @param regionId - Optional region ID to filter by
 * @param options - Optional sort options
 * @returns Array of provinces with region information
 */
export async function getProvincesWithRegion(
  regionId?: number,
  options?: ProvinceSortOptions
): Promise<ProvinceWithRegion[]> {
  const query = supabase
    .from('v_province_with_region')
    .select('*')

  if (regionId !== undefined) {
    query.eq('region_id', regionId)
  }

  if (options) {
    query.order(options.field, { ascending: options.order === 'asc' })
  } else {
    query.order('province_name_en', { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching provinces with region:', error)
    throw new Error(`Failed to fetch provinces with region: ${error.message}`)
  }

  return data || []
}

/**
 * Search provinces by name
 * @param options - Search options including query and language preference
 * @returns Array of matching provinces
 */
export async function searchProvinces(
  options: ProvinceSearchOptions
): Promise<Province[]> {
  const { query: searchQuery, language = 'both' } = options
  const searchQueryLower = searchQuery.toLowerCase()

  // Build the query based on language preference
  let supabaseQuery = supabase.from('province').select('*')

  if (language === 'en') {
    supabaseQuery = supabaseQuery.ilike('province_name_en', `%${searchQuery}%`)
  } else if (language === 'th') {
    supabaseQuery = supabaseQuery.ilike('province_name_th', `%${searchQuery}%`)
  } else {
    // Search both English and Thai names
    supabaseQuery = supabaseQuery.or(
      `province_name_en.ilike.%${searchQuery}%,province_name_th.ilike.%${searchQuery}%`
    )
  }

  const { data, error } = await supabaseQuery.order('province_name_en', { ascending: true })

  if (error) {
    console.error('Error searching provinces:', error)
    throw new Error(`Failed to search provinces: ${error.message}`)
  }

  return data || []
}

/**
 * Search provinces with region information
 * @param options - Search options including query and language preference
 * @returns Array of matching provinces with region information
 */
export async function searchProvincesWithRegion(
  options: ProvinceSearchOptions
): Promise<ProvinceWithRegion[]> {
  const { query: searchQuery, language = 'both' } = options

  // Build the query based on language preference
  let supabaseQuery = supabase.from('v_province_with_region').select('*')

  if (language === 'en') {
    supabaseQuery = supabaseQuery.ilike('province_name_en', `%${searchQuery}%`)
  } else if (language === 'th') {
    supabaseQuery = supabaseQuery.ilike('province_name_th', `%${searchQuery}%`)
  } else {
    // Search both English and Thai names
    supabaseQuery = supabaseQuery.or(
      `province_name_en.ilike.%${searchQuery}%,province_name_th.ilike.%${searchQuery}%`
    )
  }

  const { data, error } = await supabaseQuery.order('province_name_en', { ascending: true })

  if (error) {
    console.error('Error searching provinces with region:', error)
    throw new Error(`Failed to search provinces with region: ${error.message}`)
  }

  return data || []
}

// UTILITY FUNCTIONS
// ==================

/**
 * Fetch all data needed for a province dropdown selector
 * @returns Object with regions and provinces organized for UI usage
 */
export async function getProvinceSelectorData() {
  const [regions, provincesWithRegion] = await Promise.all([
    getAllRegions(),
    getProvincesWithRegion()
  ])

  // Group provinces by region
  const provincesByRegion = regions.map(region => ({
    ...region,
    provinces: provincesWithRegion.filter(p => p.region_id === region.region_id)
  }))

  return {
    regions,
    provincesByRegion,
    provinces: provincesWithRegion
  }
}

/**
 * Get province name by ID (with language preference)
 * @param provinceId - The province ID
 * @param language - Language preference ('en' or 'th')
 * @returns Province name or empty string if not found
 */
export async function getProvinceNameById(
  provinceId: number,
  language: 'en' | 'th' = 'en'
): Promise<string> {
  const province = await getProvinceById(provinceId)
  if (!province) return ''
  return language === 'en' ? province.province_name_en : province.province_name_th
}

/**
 * Get region name by ID (with language preference)
 * @param regionId - The region ID
 * @param language - Language preference ('en' or 'th')
 * @returns Region name or empty string if not found
 */
export async function getRegionNameById(
  regionId: number,
  language: 'en' | 'th' = 'en'
): Promise<string> {
  const region = await getRegionById(regionId)
  if (!region) return ''
  return language === 'en' ? region.region_name_en : region.region_name_th
}

/**
 * Get province with region name by ID
 * @param provinceId - The province ID
 * @returns Province with region information or null if not found
 */
export async function getProvinceWithRegionName(
  provinceId: number
): Promise<ProvinceWithRegion | null> {
  const { data, error } = await supabase
    .from('v_province_with_region')
    .select('*')
    .eq('province_id', provinceId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching province with region:', error)
    throw new Error(`Failed to fetch province with region: ${error.message}`)
  }

  return data
}

// BATCH OPERATIONS
// ================

/**
 * Fetch multiple provinces by their IDs
 * @param provinceIds - Array of province IDs
 * @returns Array of provinces
 */
export async function getProvincesByIds(provinceIds: number[]): Promise<Province[]> {
  if (provinceIds.length === 0) return []

  const { data, error } = await supabase
    .from('province')
    .select('*')
    .in('province_id', provinceIds)
    .order('province_id', { ascending: true })

  if (error) {
    console.error('Error fetching provinces by IDs:', error)
    throw new Error(`Failed to fetch provinces by IDs: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch multiple regions by their IDs
 * @param regionIds - Array of region IDs
 * @returns Array of regions
 */
export async function getRegionsByIds(regionIds: number[]): Promise<Region[]> {
  if (regionIds.length === 0) return []

  const { data, error } = await supabase
    .from('region')
    .select('*')
    .in('region_id', regionIds)
    .order('region_id', { ascending: true })

  if (error) {
    console.error('Error fetching regions by IDs:', error)
    throw new Error(`Failed to fetch regions by IDs: ${error.message}`)
  }

  return data || []
}
