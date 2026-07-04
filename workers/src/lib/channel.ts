export type AtlasChannel =
  | "seo"
  | "email"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "x"
  | "community"
  | "general";

const allowedChannels = new Set<AtlasChannel>([
  "seo",
  "email",
  "tiktok",
  "instagram",
  "youtube",
  "x",
  "community",
  "general",
]);

export function normalizeChannel(value: string | null | undefined): AtlasChannel {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "ig") return "instagram";
  if (normalized === "yt" || normalized === "shorts") return "youtube";
  if (normalized === "twitter" || normalized === "grok") return "x";
  if (allowedChannels.has(normalized as AtlasChannel)) return normalized as AtlasChannel;
  return "general";
}

export function inferChannel(input: {
  channel?: string | null;
  tags?: string[] | null;
  sourceUrl?: string | null;
  text?: string | null;
}): AtlasChannel {
  const direct = normalizeChannel(input.channel);
  if (direct !== "general") return direct;

  const haystack = [
    ...(input.tags ?? []),
    input.sourceUrl ?? "",
    input.text ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("tiktok")) return "tiktok";
  if (haystack.includes("instagram") || haystack.includes("reels")) return "instagram";
  if (haystack.includes("youtube") || haystack.includes("shorts") || haystack.includes("youtu.be")) return "youtube";
  if (haystack.includes("x.com") || haystack.includes("twitter") || haystack.includes("live discussion")) return "x";
  if (haystack.includes("reddit") || haystack.includes("community") || haystack.includes("forum")) return "community";
  if (haystack.includes("email") || haystack.includes("newsletter") || haystack.includes("capture")) return "email";
  if (haystack.includes("seo") || haystack.includes("search") || haystack.includes("rank")) return "seo";
  return "general";
}
