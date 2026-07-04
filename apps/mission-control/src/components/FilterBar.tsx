"use client";

import { useEffect, useState } from "react";

export type AtlasPropertyFilter = "all" | "store" | "huh" | "restaurant" | "general";
export type AtlasChannelFilter =
  | "all"
  | "seo"
  | "email"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "x"
  | "community";

export type AtlasFilters = {
  property: AtlasPropertyFilter;
  channel: AtlasChannelFilter;
};

type Counts = {
  properties: Record<AtlasPropertyFilter, number>;
  channels: Record<AtlasChannelFilter, number>;
};

const propertyItems: Array<{ key: AtlasPropertyFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "store", label: "Store" },
  { key: "huh", label: "Huh?" },
  { key: "restaurant", label: "Restaurant" },
  { key: "general", label: "General" },
];

const channelItems: Array<{ key: AtlasChannelFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "seo", label: "SEO" },
  { key: "email", label: "Email" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "IG" },
  { key: "youtube", label: "YT" },
  { key: "x", label: "X" },
  { key: "community", label: "Community" },
];

const storageKey = "atlas-filters-v1";
const defaultFilters: AtlasFilters = { property: "all", channel: "all" };

export function useAtlasFilters() {
  const [filters, setFilters] = useState<AtlasFilters>(defaultFilters);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setFilters(normalizeFilters(JSON.parse(stored) as Partial<AtlasFilters>));
    } finally {
      setReady(true);
    }
  }, []);

  function updateFilters(next: AtlasFilters) {
    setFilters(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  return { filters, setFilters: updateFilters, ready };
}

export function FilterBar({
  filters,
  counts,
  onChange,
}: {
  filters: AtlasFilters;
  counts: Counts;
  onChange: (filters: AtlasFilters) => void;
}) {
  return (
    <div className="filter-row" aria-label="Atlas filters">
      {propertyItems.map((item) => (
        <button
          className={filters.property === item.key ? "active" : ""}
          type="button"
          key={`property-${item.key}`}
          onClick={() => onChange({ ...filters, property: item.key })}
        >
          {item.label} {counts.properties[item.key] ?? 0}
        </button>
      ))}
      {channelItems.map((item) => (
        <button
          className={filters.channel === item.key ? "active" : ""}
          type="button"
          key={`channel-${item.key}`}
          onClick={() => onChange({ ...filters, channel: item.key })}
        >
          {item.label} {counts.channels[item.key] ?? 0}
        </button>
      ))}
    </div>
  );
}

export function emptyCounts(): Counts {
  return {
    properties: { all: 0, store: 0, huh: 0, restaurant: 0, general: 0 },
    channels: { all: 0, seo: 0, email: 0, tiktok: 0, instagram: 0, youtube: 0, x: 0, community: 0 },
  };
}

function normalizeFilters(value: Partial<AtlasFilters>): AtlasFilters {
  const property = propertyItems.some((item) => item.key === value.property) ? value.property : "all";
  const channel = channelItems.some((item) => item.key === value.channel) ? value.channel : "all";
  return { property: property ?? "all", channel: channel ?? "all" };
}
