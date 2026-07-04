"use client";

import { useEffect, useState } from "react";

export type AtlasPropertyFilter = string;
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
  properties: Record<string, number>;
  channels: Record<AtlasChannelFilter, number>;
};

export type PropertyOption = {
  slug: string;
  display_name: string;
  color: string | null;
  active: boolean;
};

const fallbackPropertyItems: PropertyOption[] = [
  { slug: "store", display_name: "PACO Peptide", color: "#C7B9A6", active: true },
  { slug: "huh", display_name: "Huh? Learn Spanish", color: "#4ade80", active: true },
  { slug: "restaurant", display_name: "Motel West / PACO", color: "#f59e0b", active: true },
  { slug: "general", display_name: "General", color: "#94a3b8", active: true },
];

const propertyItems: Array<{ key: AtlasPropertyFilter; label: string; color?: string | null }> = [
  { key: "all", label: "All" },
  ...fallbackPropertyItems.map((property) => ({
    key: property.slug,
    label: property.display_name,
    color: property.color,
  })),
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
const focusStorageKey = "atlas-focus-property-v1";
const defaultFocusProperty = "store";
const defaultFilters: AtlasFilters = { property: defaultFocusProperty, channel: "all" };

export function useAtlasFilters() {
  const [filters, setFilters] = useState<AtlasFilters>(defaultFilters);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlProperty = params.get("property");
      const urlChannel = params.get("channel");
      const stored = window.localStorage.getItem(storageKey);
      const localFocus = window.localStorage.getItem(focusStorageKey) || defaultFocusProperty;
      if (urlProperty || urlChannel) {
        const next = normalizeFilters({
          property: urlProperty || localFocus,
          channel: (urlChannel || undefined) as AtlasChannelFilter | undefined,
        });
        setFilters(next);
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } else if (stored) {
        setFilters(normalizeFilters(JSON.parse(stored) as Partial<AtlasFilters>));
      } else {
        setFilters({ property: localFocus, channel: "all" });
      }
      fetch("/api/focus")
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("focus unavailable")))
        .then((payload) => {
          if (typeof payload.focusProperty === "string") {
            window.localStorage.setItem(focusStorageKey, payload.focusProperty);
            if (!stored && !urlProperty && !urlChannel) {
              setFilters({ property: payload.focusProperty, channel: "all" });
            }
          }
        })
        .catch(() => undefined);
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

export function useFocusProperty() {
  const [focusProperty, setFocusPropertyState] = useState(defaultFocusProperty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const localFocus = window.localStorage.getItem(focusStorageKey) || defaultFocusProperty;
    setFocusPropertyState(localFocus);
    fetch("/api/focus")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("focus unavailable")))
      .then((payload) => {
        if (typeof payload.focusProperty === "string") {
          window.localStorage.setItem(focusStorageKey, payload.focusProperty);
          setFocusPropertyState(payload.focusProperty);
        }
      })
      .finally(() => setReady(true));
  }, []);

  async function setFocusProperty(next: string) {
    setFocusPropertyState(next);
    window.localStorage.setItem(focusStorageKey, next);
    await fetch("/api/focus", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focusProperty: next }),
    });
  }

  return { focusProperty, setFocusProperty, ready };
}

export function useProperties(includeInactive = false) {
  const [properties, setProperties] = useState<PropertyOption[]>(fallbackPropertyItems);

  useEffect(() => {
    fetch(`/api/properties${includeInactive ? "?includeInactive=true" : ""}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("properties unavailable")))
      .then((payload) => setProperties(payload.properties ?? fallbackPropertyItems))
      .catch(() => setProperties(fallbackPropertyItems));
  }, [includeInactive]);

  return properties;
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
  const properties = useProperties(false);
  const dynamicPropertyItems = [
    { key: "all", label: "All", color: null },
    ...properties.map((property) => ({
      key: property.slug,
      label: property.display_name,
      color: property.color,
    })),
  ];

  return (
    <div className="filter-row" aria-label="Atlas filters">
      {dynamicPropertyItems.map((item) => (
        <button
          className={filters.property === item.key ? "active" : ""}
          type="button"
          key={`property-${item.key}`}
          onClick={() => onChange({ ...filters, property: item.key })}
          style={item.color ? { borderColor: item.color } : undefined}
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
  const property = typeof value.property === "string" && value.property ? value.property : "all";
  const channel = channelItems.some((item) => item.key === value.channel) ? value.channel : "all";
  return { property: property ?? "all", channel: channel ?? "all" };
}
