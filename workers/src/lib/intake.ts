import { PDFParse } from "pdf-parse";
import type { ResolvedJobConfig } from "./config.js";
import { inferChannel } from "./channel.js";
import { atlasDb, getSupabase } from "./db.js";
import { GovernorStop, type ModelGovernor } from "./governor.js";
import { parseJsonArray } from "./json.js";
import { fetchSnapshot } from "./sources.js";

type IntakeRow = {
  id: string;
  kind: "url" | "text" | "file";
  content: string;
  property: string | null;
};

type IntakeFinding = {
  property: string;
  claim: string;
  evidence: string;
  source_url: string | null;
  confidence: number;
  tags: string[];
  channel?: string;
  specimen?: SpecimenDraft;
};

type SpecimenDraft = {
  platform?: string | null;
  account_handle?: string | null;
  post_url?: string | null;
  property?: string | null;
  channel?: string | null;
  format?: string | null;
  observed_metrics?: {
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    followers?: number | null;
  } | null;
  observed_at?: string | null;
  comment_sentiment?: string | null;
  mechanics?: string[] | null;
  dissection?: string | null;
  engagement_ratios?: Record<string, number | null> | null;
  authenticity?: "high" | "medium" | "low" | "unknown";
  authenticity_reason?: string | null;
};

const allowedProperties = new Set(["store", "huh", "restaurant", "general"]);

export async function processIntakeRows(
  governor: ModelGovernor,
  pulseGovernor: ModelGovernor,
  scoutConfig: ResolvedJobConfig,
  system: string,
  remainingCap: number,
) {
  if (remainingCap <= 0) return 0;

  const { data, error } = await atlasDb()
    .from("intake")
    .select("id, kind, content, property")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) throw error;

  let insertedCount = 0;

  for (const row of (data ?? []) as IntakeRow[]) {
    if (insertedCount >= remainingCap) break;

    try {
      const source = await loadIntakeSource(row);
      const maxFindings = Math.min(3, remainingCap - insertedCount);
      const prompt = source.kind === "x-url"
        ? buildXUrlPrompt(row, maxFindings)
        : source.image
        ? buildPhotoPrompt(row, maxFindings)
        : buildIntakePrompt(row, source.text, maxFindings);
      const activeGovernor = source.kind === "x-url" ? pulseGovernor : governor;
      const activeAgent = source.kind === "x-url" ? "atlas-scout-pulse" : "atlas-scout";
      const response = await activeGovernor.complete(activeAgent, {
        system,
        maxTokens: 1200,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: source.image
              ? [
                  { type: "text", text: prompt },
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: source.image.mediaType,
                      data: source.image.data,
                    },
                  },
                ]
              : prompt,
          },
        ],
      });

      const findings = parseJsonArray<IntakeFinding>(response.text)
        .filter((finding) => finding.claim && finding.evidence)
        .slice(0, maxFindings)
        .map((finding) => ({
          agent: activeAgent,
          property: normalizeProperty(row.property ?? finding.property, finding.tags),
          channel: inferChannel({
            channel: source.kind === "x-url" ? "x" : finding.channel,
            tags: finding.tags,
            sourceUrl: row.kind === "url" ? row.content : finding.source_url ?? source.sourceUrl,
            text: `${finding.claim} ${finding.evidence}`,
          }),
          claim: finding.claim,
          evidence: finding.evidence,
          source_url: row.kind === "url" ? row.content : finding.source_url ?? source.sourceUrl,
          confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.5))),
          tags: Array.from(new Set([
            ...(finding.tags ?? []),
            "intake",
            ...(source.image ? ["photo"] : []),
            ...(source.kind === "x-url" ? ["pulse", "x"] : []),
          ])),
        }));

      if (findings.length > 0) {
        const { error: insertError } = await atlasDb().from("findings").insert(findings);
        if (isMissingChannelError(insertError)) {
          const { error: retryError } = await atlasDb()
            .from("findings")
            .insert(findings.map(({ channel: _channel, ...finding }) => finding));
          if (retryError) throw retryError;
        } else if (insertError) {
          throw insertError;
        }
      }

      await insertSpecimens(row, source, findings);

      insertedCount += findings.length;
      await markIntake(row.id, "processed", `created ${findings.length} findings`);
    } catch (error) {
      if (error instanceof GovernorStop) throw error;

      if (error instanceof NoTranscriptError) {
        await markIntake(row.id, "failed", "no transcript");
        continue;
      }

      if (error instanceof WalledGardenError) {
        await markIntake(row.id, "failed", "walled garden — screenshot it and drop the photo instead");
        continue;
      }

      await markIntake(
        row.id,
        "failed",
        error instanceof Error ? error.message.slice(0, 500) : "intake processing failed",
      );
    }
  }

  return insertedCount;
}

function buildXUrlPrompt(row: IntakeRow, maxFindings: number) {
  return `Analyze this account/post's marketing approach.

Use xAI search tools when available to inspect the X/Twitter URL.

Rules:
- Return a JSON array only.
- Max ${maxFindings} findings.
- Each object must include: property, claim, evidence, source_url, confidence, tags.
- Include channel as one of: seo, email, tiktok, instagram, youtube, x, community, general. Use "x" for X/Twitter links.
- property must be one of: store, huh, restaurant, general.
- Every tag array must include "intake", "pulse", and "x".
- Focus on positioning, hook, audience, content format, social proof, and what Sam can steal ethically.
- Tie every claim to the linked account/post evidence.
- If this is a social post/account, include a specimen object on the most relevant finding:
  { platform, account_handle, post_url, property, channel, format, observed_metrics, observed_at, comment_sentiment, mechanics, dissection, engagement_ratios, authenticity, authenticity_reason }.
- observed_metrics may include views, likes, comments, shares, followers only when visible or available. Unreadable metrics must be null.
- authenticity must be high, medium, low, or unknown. Label it as heuristic, not accusation: ratios flag anomalies, they don't prove purchase.
- Reject generic social media advice.

URL:
${row.content}`;
}

function buildIntakePrompt(row: IntakeRow, text: string, maxFindings: number) {
  return `Dissect this Sam-provided intake item into Atlas marketing findings.

Rules:
- Return a JSON array only.
- Max ${maxFindings} findings.
- Each object must include: property, claim, evidence, source_url, confidence, tags.
- Include channel as one of: seo, email, tiktok, instagram, youtube, x, community, general.
- property must be one of: store, huh, restaurant, general.
- Every tag array must include "intake".
- Tie each claim to specific evidence from the dropped source.
- If this is a social post/account, include a specimen object on the most relevant finding:
  { platform, account_handle, post_url, property, channel, format, observed_metrics, observed_at, comment_sentiment, mechanics, dissection, engagement_ratios, authenticity, authenticity_reason }.
- observed_metrics may include views, likes, comments, shares, followers only when visible. Unreadable metrics must be null.
- authenticity must be high, medium, low, or unknown. Label it as heuristic, not accusation: ratios flag anomalies, they don't prove purchase.
- Prefer buyer-producing hooks, objections, proof devices, formats, and next tests.
- Reject generic summaries.

Intake:
${JSON.stringify(
  {
    id: row.id,
    kind: row.kind,
    property: row.property,
    content: row.content,
    text: text.slice(0, 12000),
  },
  null,
  2,
)}`;
}

function buildPhotoPrompt(row: IntakeRow, maxFindings: number) {
  return `Dissect this Sam-provided photo into Atlas marketing findings.

Rules:
- Return a JSON array only.
- Max ${maxFindings} findings.
- Each object must include: property, claim, evidence, source_url, confidence, tags.
- Include channel as one of: seo, email, tiktok, instagram, youtube, x, community, general.
- property must be one of: store, huh, restaurant, general.
- Every tag array must include "intake" and "photo".
- Answer what this is, what marketing mechanics are at work, what's stealable, and what's the hook.
- Explicitly extract visual hierarchy: what the eye hits first, second, and third.
- Explicitly extract typography character: what the font choice signals.
- Explicitly extract color/contrast strategy.
- Explicitly extract layout density.
- Explicitly identify the ONE mechanic most worth stealing.
- Output those as separate findings where distinct.
- Tie every claim to visible evidence in the image.
- If the image is a social post/account screenshot, include a specimen object on the most relevant finding:
  { platform, account_handle, post_url, property, channel, format, observed_metrics, observed_at, comment_sentiment, mechanics, dissection, engagement_ratios, authenticity, authenticity_reason }.
- observed_metrics may include views, likes, comments, shares, followers only when visible. Unreadable metrics must be null.
- Assess comment quality if visible: generic/emoji-only/bot-cadence vs substantive.
- authenticity must be high, medium, low, or unknown with a one-line reason. Label it as heuristic, not accusation: ratios flag anomalies, they don't prove purchase.
- Reject generic visual description.

Intake:
${JSON.stringify(
  {
    id: row.id,
    kind: row.kind,
    property: row.property,
    content: row.content,
  },
  null,
  2,
)}`;
}

async function markIntake(id: string, status: "processed" | "failed", notes: string) {
  const { error } = await atlasDb()
    .from("intake")
    .update({
      status,
      processed_at: new Date().toISOString(),
      notes,
    })
    .eq("id", id);

  if (error) throw error;
}

async function insertSpecimens(row: IntakeRow, source: LoadedSource, findings: IntakeFinding[]) {
  const specimens = findings
    .map((finding) => finding.specimen)
    .filter((specimen): specimen is SpecimenDraft => Boolean(specimen));

  if (specimens.length === 0) return;

  const rows = specimens.slice(0, 1).map((specimen) => {
    const metrics = normalizeMetrics(specimen.observed_metrics);
    const ratios = specimen.engagement_ratios ?? computeEngagementRatios(metrics);
    return {
      platform: specimen.platform ?? inferPlatform(row.content),
      account_handle: specimen.account_handle ?? null,
      post_url: row.kind === "url" ? row.content : specimen.post_url ?? source.sourceUrl,
      property: normalizeProperty(row.property ?? specimen.property, null),
      channel: inferChannel({
        channel: source.kind === "x-url" ? "x" : specimen.channel,
        sourceUrl: row.kind === "url" ? row.content : specimen.post_url ?? source.sourceUrl,
        text: `${specimen.format ?? ""} ${(specimen.mechanics ?? []).join(" ")} ${specimen.dissection ?? ""}`,
      }),
      format: specimen.format ?? null,
      observed_metrics: metrics,
      observed_at: specimen.observed_at ?? new Date().toISOString(),
      comment_sentiment: specimen.comment_sentiment ?? null,
      mechanics: specimen.mechanics ?? [],
      dissection: specimen.dissection ?? null,
      engagement_ratios: ratios,
      authenticity: specimen.authenticity ?? inferAuthenticity(metrics, ratios),
      authenticity_reason: specimen.authenticity_reason ?? "Heuristic only: ratios flag anomalies; they do not prove purchase.",
      intake_id: row.id,
      pattern_ids: [],
    };
  });

  const { error } = await atlasDb().from("specimens").insert(rows);
  if (isMissingSpecimensError(error)) return;
  if (error) throw error;
}

type LoadedSource = {
  kind: "text" | "image" | "x-url";
  text: string;
  sourceUrl: string | null;
  image?: {
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    data: string;
  };
};

async function loadIntakeSource(row: IntakeRow): Promise<LoadedSource> {
  if (row.kind === "text") {
    return { kind: "text", text: row.content, sourceUrl: null };
  }

  if (row.kind === "url") {
    if (isWalledGardenUrl(row.content)) {
      throw new WalledGardenError();
    }

    if (isXUrl(row.content)) {
      return { kind: "x-url", text: row.content, sourceUrl: row.content };
    }

    if (isYouTubeUrl(row.content)) {
      return { kind: "text", text: await loadYouTubeTranscript(row.content), sourceUrl: row.content };
    }

    if (isTikTokUrl(row.content)) {
      throw new NoTranscriptError();
    }

    const snapshot = await fetchSnapshot(row.content);
    return {
      kind: "text",
      text: [snapshot.title, snapshot.excerpt].filter(Boolean).join("\n\n"),
      sourceUrl: row.content,
    };
  }

  const { data, error } = await getSupabase().storage.from("atlas-intake").download(row.content);
  if (error) throw error;

  const buffer = Buffer.from(await data.arrayBuffer());
  const extension = row.content.split(".").pop()?.toLowerCase();

  if (isImageExtension(extension)) {
    return {
      kind: "image",
      text: "Photo intake file.",
      sourceUrl: row.content,
      image: {
        mediaType: imageMediaType(extension),
        data: buffer.toString("base64"),
      },
    };
  }

  if (extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return { kind: "text", text: parsed.text, sourceUrl: row.content };
  }

  return { kind: "text", text: buffer.toString("utf8"), sourceUrl: row.content };
}

function isImageExtension(extension: string | undefined) {
  return extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp";
}

function isMissingChannelError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("channel"));
}

function isMissingSpecimensError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("specimens"));
}

function normalizeMetrics(metrics: SpecimenDraft["observed_metrics"]) {
  return {
    views: numberOrNull(metrics?.views),
    likes: numberOrNull(metrics?.likes),
    comments: numberOrNull(metrics?.comments),
    shares: numberOrNull(metrics?.shares),
    followers: numberOrNull(metrics?.followers),
  };
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeEngagementRatios(metrics: ReturnType<typeof normalizeMetrics>) {
  return {
    likes_per_follower: metrics.likes !== null && metrics.followers ? roundRatio(metrics.likes / metrics.followers) : null,
    comments_per_like: metrics.comments !== null && metrics.likes ? roundRatio(metrics.comments / metrics.likes) : null,
    views_per_like: metrics.views !== null && metrics.likes ? roundRatio(metrics.views / metrics.likes) : null,
  };
}

function inferAuthenticity(metrics: ReturnType<typeof normalizeMetrics>, ratios: Record<string, number | null>) {
  if (metrics.views === null && metrics.likes === null && metrics.comments === null) return "unknown";
  if (ratios.views_per_like !== null && ratios.views_per_like > 400) return "low";
  if (ratios.comments_per_like !== null && ratios.comments_per_like < 0.001) return "medium";
  return "unknown";
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function inferPlatform(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host.includes("x.com") || host.includes("twitter.com")) return "x";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  } catch {
    return null;
  }
  return null;
}

function imageMediaType(extension: string | undefined): "image/jpeg" | "image/png" | "image/webp" {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function normalizeProperty(property: string | null | undefined, tags: string[] | null | undefined) {
  if (property && allowedProperties.has(property)) return property;
  if (tags?.some((tag) => tag.includes("huh") || tag.includes("language"))) return "huh";
  if (tags?.some((tag) => tag.includes("store") || tag.includes("peptide"))) return "store";
  return "general";
}

function isYouTubeUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

function isTikTokUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").endsWith("tiktok.com");
  } catch {
    return false;
  }
}

function isXUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com";
  } catch {
    return false;
  }
}

function isWalledGardenUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "instagram.com" || host.endsWith(".instagram.com") || host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function youtubeVideoId(value: string) {
  const url = new URL(value);
  if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0];
  if (url.pathname === "/watch") return url.searchParams.get("v");
  if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
  return null;
}

async function loadYouTubeTranscript(value: string) {
  const videoId = youtubeVideoId(value);
  if (!videoId) throw new NoTranscriptError();

  const watchResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await watchResponse.text();
  const match = html.match(/"captionTracks":(\[.*?\]),"audioTracks"/);
  if (!match?.[1]) throw new NoTranscriptError();

  const tracks = JSON.parse(match[1]) as Array<{ baseUrl?: string; languageCode?: string }>;
  const track = tracks.find((candidate) => candidate.languageCode?.startsWith("en")) ?? tracks[0];
  if (!track?.baseUrl) throw new NoTranscriptError();

  const transcriptResponse = await fetch(track.baseUrl);
  const transcriptXml = await transcriptResponse.text();
  const transcript = transcriptXml
    .replace(/<text[^>]*>/g, "\n")
    .replace(/<\/text>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  if (!transcript) throw new NoTranscriptError();
  return transcript;
}

class NoTranscriptError extends Error {
  constructor() {
    super("no transcript");
    this.name = "NoTranscriptError";
  }
}

class WalledGardenError extends Error {
  constructor() {
    super("walled garden — screenshot it and drop the photo instead");
    this.name = "WalledGardenError";
  }
}
