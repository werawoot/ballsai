// Types and utilities for Thailand Regions and Provinces

// Region types
export interface Region {
  region_id: number;
  region_name_en: string;
  region_name_th: string;
  created_at: string;
  updated_at: string;
}

export type RegionInsert = Omit<
  Region,
  "region_id" | "created_at" | "updated_at"
>;
export type RegionUpdate = Partial<
  Pick<Region, "region_name_en" | "region_name_th">
>;

// Province types
export interface Province {
  province_id: number;
  province_name_en: string;
  province_name_th: string;
  region_id: number;
  created_at: string;
  updated_at: string;
}

export type ProvinceInsert = Omit<
  Province,
  "province_id" | "created_at" | "updated_at"
>;
export type ProvinceUpdate = Partial<
  Pick<Province, "province_name_en" | "province_name_th" | "region_id">
>;

// View types
export interface ProvinceWithRegion {
  province_id: number;
  province_name_en: string;
  province_name_th: string;
  region_id: number;
  region_name_en: string;
  region_name_th: string;
}

export interface RegionWithProvinceCount {
  region_id: number;
  region_name_en: string;
  region_name_th: string;
  province_count: number;
}

// Table names
export const REGION_TABLE = "region" as const;
export const PROVINCE_TABLE = "province" as const;

// View names
export const PROVINCE_WITH_REGION_VIEW = "v_province_with_region" as const;
export const REGION_WITH_PROVINCE_COUNT_VIEW =
  "v_region_with_province_count" as const;

// Thailand's region constants
export const THAI_REGIONS = {
  NORTHERN: { id: 1, name_en: "Northern Region", name_th: "ภาคเหนือ" },
  NORTHEASTERN: {
    id: 2,
    name_en: "Northeastern Region",
    name_th: "ภาคตะวันออกเฉียงเหนือ",
  },
  CENTRAL: { id: 3, name_en: "Central Region", name_th: "ภาคกลาง" },
  EASTERN: { id: 4, name_en: "Eastern Region", name_th: "ภาคตะวันออก" },
  WESTERN: { id: 5, name_en: "Western Region", name_th: "ภาคตะวันตก" },
  SOUTHERN: { id: 6, name_en: "Southern Region", name_th: "ภาคใต้" },
} as const;

export type ThaiRegionKey = keyof typeof THAI_REGIONS;

// Helper functions
export function getRegionById(id: number): Region | undefined {
  const region = Object.values(THAI_REGIONS).find((r) => r.id === id);
  if (!region) return undefined;
  return {
    region_id: region.id,
    region_name_en: region.name_en,
    region_name_th: region.name_th,
    created_at: "",
    updated_at: "",
  };
}

export function getRegionName(
  id: number,
  language: "en" | "th" = "en",
): string {
  const region = Object.values(THAI_REGIONS).find((r) => r.id === id);
  if (!region) return "";
  return language === "en" ? region.name_en : region.name_th;
}

export function isProvinceIdValid(provinceId: number): boolean {
  // Thai province IDs typically range from 10 to 97
  return provinceId >= 10 && provinceId <= 97;
}

export function isRegionIdValid(regionId: number): boolean {
  return regionId >= 1 && regionId <= 6;
}

// Query builder helpers
export function buildProvinceWithRegionQuery() {
  return `
    SELECT
      p.province_id,
      p.province_name_en,
      p.province_name_th,
      p.region_id,
      r.region_name_en,
      r.region_name_th
    FROM province p
    JOIN region r ON p.region_id = r.region_id
  `;
}

export function buildRegionWithProvinceCountQuery() {
  return `
    SELECT
      r.region_id,
      r.region_name_en,
      r.region_name_th,
      COUNT(p.province_id) AS province_count
    FROM region r
    LEFT JOIN province p ON r.region_id = p.region_id
    GROUP BY r.region_id, r.region_name_en, r.region_name_th
    ORDER BY r.region_id
  `;
}

// Sort options for provinces
export interface ProvinceSortOptions {
  field: "province_id" | "province_name_en" | "province_name_th" | "region_id";
  order: "asc" | "desc";
}

export function sortProvinces(
  provinces: Province[],
  options: ProvinceSortOptions = { field: "province_name_en", order: "asc" },
): Province[] {
  return [...provinces].sort((a, b) => {
    const aVal = a[options.field];
    const bVal = b[options.field];

    if (typeof aVal === "number" && typeof bVal === "number") {
      return options.order === "asc" ? aVal - bVal : bVal - aVal;
    }

    const comparison = String(aVal).localeCompare(String(bVal));
    return options.order === "asc" ? comparison : -comparison;
  });
}

// Search utilities
export interface ProvinceSearchOptions {
  query: string;
  language?: "en" | "th" | "both";
}

export function searchProvinces(
  provinces: Province[],
  options: ProvinceSearchOptions,
): Province[] {
  const { query, language = "both" } = options;
  const lowerQuery = query.toLowerCase();

  return provinces.filter((p) => {
    if (language === "en" || language === "both") {
      if (p.province_name_en.toLowerCase().includes(lowerQuery)) return true;
    }
    if (language === "th" || language === "both") {
      if (p.province_name_th.includes(query)) return true;
    }
    return false;
  });
}

// Export all types for convenience
export type {
  Region,
  RegionInsert,
  RegionUpdate,
  Province,
  ProvinceInsert,
  ProvinceUpdate,
  ProvinceWithRegion,
  RegionWithProvinceCount,
};
