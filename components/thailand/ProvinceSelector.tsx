"use client";

import { useState, useEffect } from "react";
import { getProvinceSelectorData } from "@/lib/db/thailand-queries";
import type { ProvinceWithRegion, Region } from "@/lib/db/thailand-types";

interface ProvinceSelectorProps {
  value?: number;
  onChange?: (provinceId: number) => void;
  placeholder?: string;
  language?: "en" | "th";
  disabled?: boolean;
  className?: string;
  showRegionLabels?: boolean;
}

export function ProvinceSelector({
  value,
  onChange,
  placeholder = "Select a province",
  language = "en",
  disabled = false,
  className = "",
  showRegionLabels = true,
}: ProvinceSelectorProps) {
  const [data, setData] = useState<{
    regions: Region[];
    provincesByRegion: Array<Region & { provinces: ProvinceWithRegion[] }>;
    provinces: ProvinceWithRegion[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const result = await getProvinceSelectorData();
        setData(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load provinces",
        );
        console.error("Error loading provinces:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filteredProvinces =
    data?.provinces.filter(
      (p) =>
        searchQuery === "" ||
        (language === "en" &&
          p.province_name_en
            .toLowerCase()
            .includes(searchQuery.toLowerCase())) ||
        (language === "th" && p.province_name_th.includes(searchQuery)) ||
        (language === "both" &&
          (p.province_name_en
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
            p.province_name_th.includes(searchQuery))),
    ) || [];

  const groupedProvinces =
    showRegionLabels && data?.provincesByRegion
      ? data.provincesByRegion
          .map((region) => ({
            ...region,
            provinces: region.provinces.filter(
              (p) =>
                searchQuery === "" ||
                (language === "en" &&
                  p.province_name_en
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())) ||
                (language === "th" &&
                  p.province_name_th.includes(searchQuery)) ||
                (language === "both" &&
                  (p.province_name_en
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                    p.province_name_th.includes(searchQuery))),
            ),
          }))
          .filter((region) => region.provinces.length > 0)
      : null;

  if (loading) {
    return (
      <div className={`relative ${className}`}>
        <select
          disabled
          className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
        >
          <option>Loading provinces...</option>
        </select>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`relative ${className}`}>
        <select
          disabled
          className="w-full px-4 py-2 border border-red-300 rounded-md bg-red-50 text-red-600"
        >
          <option>Error: {error}</option>
        </select>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {searchQuery !== "" && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search provinces..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <select
        value={value || ""}
        onChange={(e) => onChange?.(Number(e.target.value))}
        disabled={disabled}
        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>

        {groupedProvinces && groupedProvinces.length > 0
          ? groupedProvinces.map((region) => (
              <optgroup
                key={region.region_id}
                label={
                  language === "en"
                    ? region.region_name_en
                    : region.region_name_th
                }
              >
                {region.provinces.map((province) => (
                  <option
                    key={province.province_id}
                    value={province.province_id}
                  >
                    {language === "en"
                      ? province.province_name_en
                      : province.province_name_th}
                  </option>
                ))}
              </optgroup>
            ))
          : filteredProvinces.map((province) => (
              <option key={province.province_id} value={province.province_id}>
                {language === "en"
                  ? province.province_name_en
                  : province.province_name_th}
              </option>
            ))}
      </select>

      {value && data && (
        <div className="mt-2 text-sm text-gray-600">
          {(() => {
            const selectedProvince = data.provinces.find(
              (p) => p.province_id === value,
            );
            if (!selectedProvince) return null;
            const selectedRegion = data.regions.find(
              (r) => r.region_id === selectedProvince.region_id,
            );
            return (
              <>
                <span className="font-medium">
                  {language === "en"
                    ? selectedProvince.province_name_en
                    : selectedProvince.province_name_th}
                </span>
                {selectedRegion && (
                  <span className="text-gray-500 ml-2">
                    (
                    {language === "en"
                      ? selectedRegion.region_name_en
                      : selectedRegion.region_name_th}
                    )
                  </span>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

interface ProvinceInfoDisplayProps {
  provinceId: number | null;
  language?: "en" | "th";
}

export function ProvinceInfoDisplay({
  provinceId,
  language = "en",
}: ProvinceInfoDisplayProps) {
  const [data, setData] = useState<ProvinceWithRegion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provinceId) {
      setData(null);
      return;
    }

    async function loadProvince() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetch(`/api/provinces/${provinceId}`);
        if (!result.ok) throw new Error("Failed to fetch province");
        const province = await result.json();
        setData(province);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load province",
        );
        console.error("Error loading province:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProvince();
  }, [provinceId]);

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!data) {
    return <div className="text-gray-400">No province selected</div>;
  }

  return (
    <div className="space-y-2">
      <div>
        <span className="text-gray-500">Province:</span>{" "}
        <span className="font-medium">
          {language === "en" ? data.province_name_en : data.province_name_th}
        </span>
      </div>
      <div>
        <span className="text-gray-500">Region:</span>{" "}
        <span className="font-medium">
          {language === "en" ? data.region_name_en : data.region_name_th}
        </span>
      </div>
      <div>
        <span className="text-gray-500">ID:</span>{" "}
        <span className="font-mono">{data.province_id}</span>
      </div>
    </div>
  );
}
