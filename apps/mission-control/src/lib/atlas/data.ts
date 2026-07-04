import { atlasDb } from "./supabase";
import { runComplianceGate } from "./compliance";
import type { AtlasUser } from "./auth";

export type Decision = "approve" | "kill" | "edit" | "revive";
export type Verdict = "keep" | "kill" | "blemish";
export type ActionStatus = "pending" | "approved" | "killed" | "published";
export type ResultMetric = "views" | "reach" | "profile_visits" | "link_taps" | "follows" | "custom";
export type AssetKind = "video" | "image" | "text";
export type AssetStatus = "shelf" | "scheduled" | "posted" | "retired";
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
  property?: AtlasPropertyFilter;
  channel?: AtlasChannelFilter;
};

const fallbackProperties = [
  { slug: "store", display_name: "PACO Peptide", color: "#7dd3fc", active: true },
  { slug: "huh", display_name: "Huh? Learn Spanish", color: "#fda4af", active: true },
  { slug: "restaurant", display_name: "Motel West / PACO", color: "#facc15", active: true },
  { slug: "general", display_name: "General", color: "#a3a3a3", active: true },
];
const properties: AtlasPropertyFilter[] = ["all", ...fallbackProperties.map((property) => property.slug)];
const channels: AtlasChannelFilter[] = ["all", "seo", "email", "tiktok", "instagram", "youtube", "x", "community"];

export async function listFindings(filters: AtlasFilters = {}) {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return filterRows(data ?? [], filters).slice(0, 50);
}

export async function listPinnedFindings(operatorEmail: string, filters: AtlasFilters = {}) {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("*")
    .eq("pinned", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (error.code === "42703" || error.message.includes("pinned")) return [];
    throw error;
  }

  const rows = filterRows(data ?? [], filters);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id).filter(Boolean);
  const { data: reads, error: readsError } = await atlasDb()
    .from("finding_reads")
    .select("finding_id")
    .eq("operator_email", operatorEmail)
    .in("finding_id", ids);

  if (readsError) {
    if (readsError.code === "42P01") return rows;
    throw readsError;
  }

  const readIds = new Set((reads ?? []).map((row) => row.finding_id));
  return rows.filter((row) => !readIds.has(row.id));
}

export async function markFindingRead(findingId: string, operatorEmail: string) {
  const { error } = await atlasDb()
    .from("finding_reads")
    .upsert({ finding_id: findingId, operator_email: operatorEmail }, { onConflict: "finding_id,operator_email" });

  if (error) throw error;
}

export async function listPatterns(filters: AtlasFilters = {}) {
  const { data, error } = await atlasDb()
    .from("patterns")
    .select("*")
    .order("support_count", { ascending: false })
    .limit(200);

  if (error) {
    if (error.message.includes("patterns") || error.code === "42P01") return [];
    throw error;
  }

  const patterns = filterRows(data ?? [], filters).slice(0, 50);
  const sourceIds = Array.from(
    new Set(patterns.flatMap((pattern) => (Array.isArray(pattern.source_finding_ids) ? pattern.source_finding_ids : []))),
  );

  if (sourceIds.length === 0) return patterns.map((pattern) => ({ ...pattern, source_findings: [] }));

  const sourceResult = await atlasDb()
    .from("findings")
    .select("*")
    .in("id", sourceIds);

  if (sourceResult.error) throw sourceResult.error;
  const sourcesById = new Map((sourceResult.data ?? []).map((finding) => [finding.id, finding]));

  return patterns.map((pattern) => ({
    ...pattern,
    source_findings: (Array.isArray(pattern.source_finding_ids) ? pattern.source_finding_ids : [])
      .map((id: string) => sourcesById.get(id))
      .filter(Boolean),
  }));
}

export async function listSpecimens(filters: AtlasFilters = {}) {
  const { data, error } = await atlasDb()
    .from("specimens")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (error.message.includes("specimens") || error.code === "42P01") return [];
    throw error;
  }

  return filterRows(data ?? [], filters)
    .sort((a, b) => specimenViews(b) - specimenViews(a))
    .slice(0, 50);
}

export async function listAssets() {
  const { data, error } = await atlasDb()
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (error.message.includes("assets") || error.code === "42P01") return [];
    throw error;
  }

  return data ?? [];
}

export async function listProperties({ includeInactive = false } = {}) {
  const { data, error } = await atlasDb()
    .from("properties")
    .select("slug, display_name, color, active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message.includes("properties")) return fallbackProperties;
    throw error;
  }

  const rows = data ?? [];
  return includeInactive ? rows : rows.filter((property) => property.active !== false);
}

export async function upsertProperty(input: {
  slug?: string;
  displayName: string;
  color?: string | null;
}) {
  const displayName = input.displayName.trim();
  const slug = slugify(input.slug || displayName);
  if (!slug || !displayName) throw new Error("Property name required.");

  const { data, error } = await atlasDb()
    .from("properties")
    .upsert({
      slug,
      display_name: displayName,
      color: normalizeColor(input.color),
      active: true,
    }, { onConflict: "slug" })
    .select("slug, display_name, color, active, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateProperty(slug: string, input: { displayName?: string; color?: string | null; active?: boolean }) {
  const update: Record<string, unknown> = {};
  if (input.displayName !== undefined) update.display_name = input.displayName.trim();
  if (input.color !== undefined) update.color = normalizeColor(input.color);
  if (input.active !== undefined) update.active = input.active;

  const { data, error } = await atlasDb()
    .from("properties")
    .update(update)
    .eq("slug", slug)
    .select("slug, display_name, color, active, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function listIntakeHistory() {
  const { data, error } = await atlasDb()
    .from("intake")
    .select("id, created_at, kind, content, property, status, processed_at, notes, finding_ids, source_chars, analyzed_chars, coverage_pct, coverage_method")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    if (error.code !== "42703") throw error;
    const fallback = await atlasDb()
      .from("intake")
      .select("id, created_at, kind, content, property, status, processed_at, notes")
      .order("created_at", { ascending: false })
      .limit(40);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []).map((row) => ({ ...row, finding_ids: [], findings: [] }));
  }

  const rows = data ?? [];
  const findingIds = Array.from(
    new Set(rows.flatMap((row) => (Array.isArray(row.finding_ids) ? row.finding_ids : []))),
  );

  if (findingIds.length === 0) return rows.map((row) => ({ ...row, findings: [] }));

  const findingsResult = await atlasDb()
    .from("findings")
    .select("id, created_at, property, channel, claim, evidence, source_url, confidence, tags, intake_coverage")
    .in("id", findingIds);

  if (findingsResult.error) throw findingsResult.error;
  const findingsById = new Map((findingsResult.data ?? []).map((finding) => [finding.id, finding]));

  return rows.map((row) => ({
    ...row,
    findings: (Array.isArray(row.finding_ids) ? row.finding_ids : [])
      .map((id: string) => findingsById.get(id))
      .filter(Boolean),
  }));
}

export async function createAsset(input: {
  property: string;
  kind: AssetKind;
  title: string;
  description?: string | null;
  file_path?: string | null;
  thumbnail_path?: string | null;
  raw_video_path?: string | null;
  duration_seconds?: number | null;
  intended_channels: string[];
  notes?: string | null;
}) {
  const { data, error } = await atlasDb()
    .from("assets")
    .insert({
      property: normalizeProperty(input.property),
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      file_path: input.file_path ?? null,
      thumbnail_path: input.thumbnail_path ?? null,
      raw_video_path: input.raw_video_path ?? null,
      duration_seconds: input.duration_seconds ?? null,
      intended_channels: input.intended_channels.map((channel) => normalizeChannel(channel)).filter((channel) => channel !== "all"),
      status: "shelf",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function createExternalPostAction(
  operator: AtlasUser,
  input: {
    property: string;
    channel: string;
    postedAt: string;
    caption: string;
    screenshotPath?: string | null;
  },
) {
  const property = normalizeProperty(input.property);
  const channel = normalizeChannel(input.channel);
  const caption = input.caption.trim();
  const postedAt = new Date(input.postedAt);
  if (!caption) throw new Error("Caption is required.");
  if (Number.isNaN(postedAt.getTime())) throw new Error("Posted date is invalid.");

  const compliance = runComplianceGate(property, caption);
  const title = caption.slice(0, 96) || "Registered external post";
  const { data: action, error } = await atlasDb()
    .from("actions")
    .insert({
      agent: "sam-manual",
      property,
      kind: "post",
      channel,
      payload: {
        title,
        caption,
        body: caption,
        external_post: true,
        registered_by: operator.email,
        posted_at: postedAt.toISOString(),
        screenshot_path: input.screenshotPath ?? null,
      },
      compliance_status: property === "store" ? compliance.status : "passed",
      compliance_notes: property === "store" ? compliance.notes : null,
      status: "published",
      decided_at: postedAt.toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;

  return action;
}

export async function prepAssetPost(assetId: string) {
  const { data: asset, error } = await atlasDb()
    .from("assets")
    .select("*")
    .eq("id", assetId)
    .single();

  if (error) throw error;

  const recommendation = (asset.recommendation ?? {}) as {
    channel?: string;
    format_note?: string;
    best_window?: string;
    confidence?: number;
    receipts?: string[];
  };
  const channel = normalizeChannel(recommendation.channel ?? asset.intended_channels?.[0] ?? "general");
  const hook = asset.description || asset.title;
  const body = [
    asset.description || asset.title,
    recommendation.format_note ? `Format note: ${recommendation.format_note}` : null,
    recommendation.best_window ? `Best window: ${recommendation.best_window}` : null,
  ].filter(Boolean).join("\n");
  const compliance = runComplianceGate(asset.property, `${asset.title}\n${hook}\n${body}`);

  const { data, error: insertError } = await atlasDb()
    .from("actions")
    .insert({
      agent: "atlas-quill",
      property: asset.property,
      kind: "post",
      channel,
      payload: {
        title: asset.title,
        hook,
        body,
        asset_id: asset.id,
        armory_recommendation: recommendation,
        pattern_ids: recommendation.receipts ?? [],
      },
      compliance_status: compliance.status,
      compliance_notes: compliance.notes,
      status: compliance.status === "passed" ? "pending" : "killed",
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

  await atlasDb()
    .from("assets")
    .update({ status: compliance.status === "passed" ? "scheduled" : "shelf", posted_action_id: data.id })
    .eq("id", asset.id);

  return data;
}

export async function getFeedCounts() {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("property, channel")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    const fallback = await atlasDb()
      .from("findings")
      .select("property")
      .order("created_at", { ascending: false })
      .limit(500);
    if (fallback.error) throw error;
    return buildCounts(fallback.data ?? []);
  }
  return buildCounts(data ?? []);
}

export async function listQueueActions(status: ActionStatus = "pending", filters: AtlasFilters = {}) {
  const { data, error } = await atlasDb()
    .from("actions")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return filterRows(data ?? [], filters).slice(0, 50);
}

export async function getQueueCounts() {
  const { data, error } = await atlasDb()
    .from("actions")
    .select("property, channel, status")
    .in("status", ["pending", "approved", "killed", "published"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return buildCounts(data ?? []);
}

export async function getQueueStatusCounts(filters: AtlasFilters = {}) {
  const { data, error } = await atlasDb()
    .from("actions")
    .select("property, channel, status")
    .in("status", ["pending", "approved", "killed", "published"])
    .limit(500);

  if (error) throw error;

  const counts: Record<ActionStatus, number> = { pending: 0, approved: 0, killed: 0, published: 0 };
  for (const row of filterRows(data ?? [], filters)) {
    const status = row.status as ActionStatus;
    if (status === "pending" || status === "approved" || status === "killed" || status === "published") {
      counts[status] += 1;
    }
  }

  return counts;
}

export async function decideAction(
  actionId: string,
  decision: Decision,
  operator: AtlasUser,
  reason?: string,
) {
  const status = decision === "approve" ? "approved" : decision === "kill" ? "killed" : "pending";
  const update: Record<string, unknown> = { status, decided_at: new Date().toISOString() };

  if (decision === "revive") {
    const { data: action, error: actionFetchError } = await atlasDb()
      .from("actions")
      .select("property, payload")
      .eq("id", actionId)
      .single();

    if (actionFetchError) throw actionFetchError;
    if (operator.role === "curator" && !(await curatorOwnsLastKill(actionId, operator.email))) {
      throw new Error("Curators can only revive their own kills.");
    }

    const payload = action.payload as Record<string, unknown>;
    const draftText = [payload.title, payload.hook, payload.body, payload.caption]
      .filter((value) => typeof value === "string")
      .join("\n");
    const compliance = runComplianceGate(action.property, draftText);
    update.compliance_status = compliance.status;
    update.compliance_notes = compliance.notes;
    update.status = compliance.status === "passed" ? "pending" : "killed";
  }

  const decisionRow = {
    action_id: actionId,
    decision,
    reason: reason || null,
    operator_email: operator.email,
  };

  const { error: decisionError } = await atlasDb().from("decisions").insert(decisionRow);
  if (isMissingOperatorEmailError(decisionError)) {
    const { operator_email: _operatorEmail, ...fallbackDecisionRow } = decisionRow;
    const { error: retryError } = await atlasDb().from("decisions").insert(fallbackDecisionRow);
    if (retryError) throw retryError;
  } else if (decisionError) {
    throw decisionError;
  }

  const { error: actionError } = await atlasDb()
    .from("actions")
    .update(update)
    .eq("id", actionId);

  if (actionError) throw actionError;
}

export async function markActionPublished(actionId: string) {
  const { error } = await atlasDb()
    .from("actions")
    .update({ status: "published", decided_at: new Date().toISOString() })
    .eq("id", actionId);

  if (error) throw error;
}

export async function publishActionRendition(
  actionId: string,
  renditionIndex: number,
  operator: AtlasUser,
) {
  const { data: action, error: actionError } = await atlasDb()
    .from("actions")
    .select("id, property, channel, kind, payload")
    .eq("id", actionId)
    .single();

  if (actionError) throw actionError;

  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const renditions = Array.isArray(payload.renditions) ? payload.renditions : [];
  const rendition = renditions[renditionIndex] as Record<string, unknown> | undefined;
  if (!rendition) throw new Error("Rendition not found.");

  const channel = normalizeChannel(String(rendition.channel ?? action.channel ?? "general"));
  const publishedAt = new Date().toISOString();
  const nextPayload = {
    ...payload,
    published_rendition: {
      index: renditionIndex,
      channel,
      published_at: publishedAt,
      operator_email: operator.email,
    },
  };

  const { error: updateError } = await atlasDb()
    .from("actions")
    .update({
      status: "published",
      decided_at: publishedAt,
      channel,
      payload: nextPayload,
    })
    .eq("id", actionId);

  if (updateError) throw updateError;

  const title = String(rendition.title ?? payload.title ?? payload.hook ?? "Published post");
  const checkpoints = ["24h", "72h", "7d", "30d"];
  const reminderRows = checkpoints.map((checkpoint) => ({
    agent: "atlas-producer",
    property: normalizeProperty(action.property),
    channel,
    claim: `Log ${checkpoint} results: ${title}`,
    evidence: `Checkpoint reminder for manually fired rendition. Action: ${actionId}. Channel: ${channel}.`,
    source_url: null,
    confidence: 0.8,
    tags: ["checkpoint", "producer", "manual-publish", checkpoint],
    pinned: true,
  }));

  const { error: reminderError } = await atlasDb().from("findings").insert(reminderRows);
  if (isMissingPinnedColumnError(reminderError)) {
    const { error: retryError } = await atlasDb()
      .from("findings")
      .insert(reminderRows.map(({ pinned: _pinned, ...row }) => row));
    if (retryError) throw retryError;
  } else if (reminderError) {
    throw reminderError;
  }

  return { actionId, channel, checkpointCount: checkpoints.length };
}

export async function logActionResult(
  actionId: string,
  operator: AtlasUser,
  input: {
    metric: ResultMetric;
    value: number;
    checkpoint: string;
    note?: string;
  },
) {
  const { data: action, error: actionError } = await atlasDb()
    .from("actions")
    .select("id, property, channel")
    .eq("id", actionId)
    .single();

  if (actionError) throw actionError;

  const row = {
    property: action.property,
    channel: normalizeChannel(action.channel),
    source: "manual",
    metric: input.metric,
    value: input.value,
    period_start: new Date().toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
    raw: {
      action_id: actionId,
      checkpoint: input.checkpoint,
      note: input.note?.trim() || null,
    },
    operator_email: operator.email,
  };

  const { error } = await atlasDb().from("results").insert(row);
  if (isMissingResultsChannelError(error)) {
    const { channel: _channel, ...fallbackRow } = row;
    const { error: retryError } = await atlasDb().from("results").insert(fallbackRow);
    if (retryError) throw retryError;
    return;
  }
  if (isMissingOperatorEmailError(error)) {
    const { operator_email: _operatorEmail, ...fallbackRow } = row;
    const { error: retryError } = await atlasDb().from("results").insert(fallbackRow);
    if (retryError) throw retryError;
    return;
  }

  if (error) throw error;
}

async function curatorOwnsLastKill(actionId: string, email: string) {
  const { data, error } = await atlasDb()
    .from("decisions")
    .select("operator_email, decision")
    .eq("action_id", actionId)
    .eq("decision", "kill")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.operator_email === email;
}

export async function listExperiments() {
  const { data, error } = await atlasDb()
    .from("experiments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function setExperimentVerdict(id: string, verdict: Verdict) {
  const { error } = await atlasDb()
    .from("experiments")
    .update({ verdict, verdict_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function getEngineEnabled() {
  const { data, error } = await atlasDb()
    .from("flags")
    .select("value, updated_at")
    .eq("key", "engine_enabled")
    .single();

  if (error) throw error;
  return { enabled: data.value === true, updated_at: data.updated_at };
}

export async function setEngineEnabled(enabled: boolean) {
  const { data, error } = await atlasDb()
    .from("flags")
    .update({ value: enabled, updated_at: new Date().toISOString() })
    .eq("key", "engine_enabled")
    .select("value, updated_at")
    .single();

  if (error) throw error;
  return { enabled: data.value === true, updated_at: data.updated_at };
}

export async function getCostsSummary() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: flags, error: flagsError } = await atlasDb()
    .from("flags")
    .select("value")
    .eq("key", "daily_cost_cap_usd")
    .single();

  if (flagsError) throw flagsError;

  const { data, error } = await atlasDb()
    .from("costs")
    .select("created_at, agent, provider, usd")
    .gte("created_at", startOfMonth.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  const todayUsd = rows
    .filter((row) => new Date(row.created_at) >= startOfToday)
    .reduce((sum, row) => sum + Number(row.usd ?? 0), 0);
  const monthUsd = rows.reduce((sum, row) => sum + Number(row.usd ?? 0), 0);
  const capUsd = Number(flags.value ?? 5);

  return {
    todayUsd,
    monthUsd,
    capUsd,
    isNearCap: todayUsd >= capUsd * 0.8,
    rows: rows.slice(0, 25),
  };
}

function filterRows<T extends { property?: string | null; channel?: string | null }>(rows: T[], filters: AtlasFilters) {
  const property = filters.property ?? "all";
  const channel = filters.channel ?? "all";

  return rows.filter((row) => {
    const rowChannel = normalizeChannel(row.channel);
    const matchesProperty = property === "all" || row.property === property;
    const matchesChannel = channel === "all" || rowChannel === channel;
    return matchesProperty && matchesChannel;
  });
}

function buildCounts(rows: Array<{ property?: string | null; channel?: string | null }>) {
  const counts = {
    properties: Object.fromEntries(properties.map((property) => [property, 0])),
    channels: Object.fromEntries(channels.map((channel) => [channel, 0])),
  } as {
    properties: Record<string, number>;
    channels: Record<AtlasChannelFilter, number>;
  };

  for (const row of rows) {
    const property = normalizeProperty(row.property);
    const channel = normalizeChannel(row.channel);
    counts.properties.all += 1;
    counts.channels.all += 1;
    if (property !== "all") counts.properties[property] = (counts.properties[property] ?? 0) + 1;
    if (channel !== "all" && channel !== "general") counts.channels[channel] += 1;
  }

  return counts;
}

function normalizeProperty(value: string | null | undefined): AtlasPropertyFilter {
  const normalized = slugify(value ?? "");
  return normalized || "general";
}

function normalizeChannel(value: string | null | undefined): AtlasChannelFilter | "general" {
  const normalized = (value ?? "general").toLowerCase();
  if (normalized === "ig") return "instagram";
  if (normalized === "yt") return "youtube";
  if (normalized === "twitter") return "x";
  return channels.includes(normalized as AtlasChannelFilter) ? (normalized as AtlasChannelFilter) : "general";
}

function specimenViews(row: { observed_metrics?: { views?: unknown } | null }) {
  const views = Number(row.observed_metrics?.views ?? 0);
  return Number.isFinite(views) ? views : 0;
}

function isMissingResultsChannelError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("channel"));
}

function isMissingOperatorEmailError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("operator_email"));
}

function isMissingPinnedColumnError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("pinned"));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeColor(value: string | null | undefined) {
  const color = value?.trim();
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}
