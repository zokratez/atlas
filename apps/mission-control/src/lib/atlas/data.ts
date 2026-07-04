import { atlasDb } from "./supabase";
import { runComplianceGate } from "./compliance";

export type Decision = "approve" | "kill" | "edit" | "revive";
export type Verdict = "keep" | "kill" | "blemish";
export type ActionStatus = "pending" | "approved" | "killed" | "published";
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
  property?: AtlasPropertyFilter;
  channel?: AtlasChannelFilter;
};

const properties: AtlasPropertyFilter[] = ["all", "store", "huh", "restaurant", "general"];
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

    const payload = action.payload as Record<string, unknown>;
    const draftText = [payload.title, payload.hook, payload.body, payload.caption]
      .filter((value) => typeof value === "string")
      .join("\n");
    const compliance = runComplianceGate(action.property, draftText);
    update.compliance_status = compliance.status;
    update.compliance_notes = compliance.notes;
    update.status = compliance.status === "passed" ? "pending" : "killed";
  }

  const { error: decisionError } = await atlasDb().from("decisions").insert({
    action_id: actionId,
    decision,
    reason: reason || null,
  });

  if (decisionError) throw decisionError;

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
    properties: Record<AtlasPropertyFilter, number>;
    channels: Record<AtlasChannelFilter, number>;
  };

  for (const row of rows) {
    const property = normalizeProperty(row.property);
    const channel = normalizeChannel(row.channel);
    counts.properties.all += 1;
    counts.channels.all += 1;
    if (property !== "all") counts.properties[property] += 1;
    if (channel !== "all" && channel !== "general") counts.channels[channel] += 1;
  }

  return counts;
}

function normalizeProperty(value: string | null | undefined): AtlasPropertyFilter {
  return properties.includes(value as AtlasPropertyFilter) ? (value as AtlasPropertyFilter) : "general";
}

function normalizeChannel(value: string | null | undefined): AtlasChannelFilter | "general" {
  const normalized = (value ?? "general").toLowerCase();
  if (normalized === "ig") return "instagram";
  if (normalized === "yt") return "youtube";
  if (normalized === "twitter") return "x";
  return channels.includes(normalized as AtlasChannelFilter) ? (normalized as AtlasChannelFilter) : "general";
}
