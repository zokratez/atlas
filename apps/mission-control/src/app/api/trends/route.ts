import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

type ProviderKey = "anthropic" | "xai" | "other";
type FindingAgentKey = "scout" | "lens" | "pulse" | "intake";
type DecisionKey = "approve" | "kill";

type CostRow = {
  id: string;
  created_at: string;
  agent: string;
  provider: string;
  tokens_in: number | null;
  tokens_out: number | null;
  usd: number | string;
};

type FindingRow = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  channel?: string | null;
  claim: string;
  evidence: string | null;
  source_url: string | null;
  confidence: number | null;
  tags: string[] | null;
};

type DecisionRow = {
  id: string;
  created_at: string;
  action_id: string | null;
  decision: string;
  reason: string | null;
  operator_email?: string | null;
};

type ActionRow = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  channel: string | null;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  compliance_status: string;
};

type ExperimentRow = {
  id: string;
  created_at: string;
  property: string;
  hypothesis: string;
  action: string;
  metric: string;
  verdict: "keep" | "kill" | "blemish" | null;
  verdict_at: string | null;
  notes: string | null;
};

type ResultRow = {
  id: string;
  created_at: string;
  property: string;
  channel?: string | null;
  metric: string;
  value: number | string;
  raw: { action_id?: string; checkpoint?: string; note?: string | null } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { searchParams } = new URL(request.url);
  const propertyFilter = searchParams.get("property") ?? "all";
  const channelFilter = searchParams.get("channel") ?? "all";

  const [costsResult, findingsResult, decisionsResult, experimentsResult, resultsResult] = await Promise.all([
    atlasDb().from("costs").select("id, created_at, agent, provider, tokens_in, tokens_out, usd").order("created_at"),
    atlasDb()
      .from("findings")
      .select("*")
      .order("created_at"),
    atlasDb().from("decisions").select("id, created_at, action_id, decision, reason, operator_email").order("created_at"),
    atlasDb()
      .from("experiments")
      .select("id, created_at, property, hypothesis, action, metric, verdict, verdict_at, notes")
      .order("created_at"),
    atlasDb().from("results").select("*").eq("source", "manual").order("created_at"),
  ]);

  if (costsResult.error) throw costsResult.error;
  if (findingsResult.error) throw findingsResult.error;
  if (decisionsResult.error) throw decisionsResult.error;
  if (experimentsResult.error) throw experimentsResult.error;
  if (resultsResult.error) throw resultsResult.error;

  const decisions = (decisionsResult.data ?? []) as DecisionRow[];
  const manualResults = (resultsResult.data ?? []) as ResultRow[];
  const resultActionIds = manualResults
    .map((result) => result.raw?.action_id)
    .filter((id): id is string => typeof id === "string");
  const actionIds = Array.from(new Set([
    ...decisions.map((decision) => decision.action_id).filter(Boolean),
    ...resultActionIds,
  ])) as string[];
  const actionsById = new Map<string, ActionRow>();

  if (actionIds.length > 0) {
    const { data, error } = await atlasDb()
      .from("actions")
      .select("id, created_at, agent, property, channel, kind, payload, status, compliance_status")
      .in("id", actionIds);

    if (error) throw error;
    for (const action of (data ?? []) as ActionRow[]) actionsById.set(action.id, action);
  }

  const costs = (costsResult.data ?? []) as CostRow[];
  const allFindings = (findingsResult.data ?? []) as FindingRow[];
  const findings = allFindings.filter((finding) => matchesFilters(finding, propertyFilter, channelFilter));
  const experiments = ((experimentsResult.data ?? []) as ExperimentRow[]).filter((experiment) =>
    matchesFilters({ property: experiment.property, channel: "general" }, propertyFilter, channelFilter),
  );

  const costsByDay: Record<string, CostRow[]> = {};
  const costMap = new Map<string, { date: string; anthropic: number; xai: number; other: number; total: number }>();
  for (const row of costs) {
    const date = dayKey(row.created_at);
    const provider = providerKey(row.provider);
    const bucket = costMap.get(date) ?? { date, anthropic: 0, xai: 0, other: 0, total: 0 };
    const usd = Number(row.usd ?? 0);
    bucket[provider] += usd;
    bucket.total += usd;
    costMap.set(date, bucket);
    costsByDay[date] = [...(costsByDay[date] ?? []), row];
  }

  const findingsByDay: Record<string, FindingRow[]> = {};
  const findingMap = new Map<
    string,
    { date: string; scout: number; lens: number; pulse: number; intake: number; total: number }
  >();
  for (const row of findings) {
    const date = dayKey(row.created_at);
    const agent = findingAgentKey(row);
    const bucket = findingMap.get(date) ?? { date, scout: 0, lens: 0, pulse: 0, intake: 0, total: 0 };
    bucket[agent] += 1;
    bucket.total += 1;
    findingMap.set(date, bucket);
    findingsByDay[date] = [...(findingsByDay[date] ?? []), row];
  }

  const curationByDay: Record<string, Array<DecisionRow & { action: ActionRow | null }>> = {};
  const curationMap = new Map<string, { date: string; approve: number; kill: number }>();
  const curationOperatorMap = new Map<string, Record<string, string | number>>();
  const operatorKeys = new Set<string>();
  for (const row of decisions) {
    const action = row.action_id ? actionsById.get(row.action_id) ?? null : null;
    if (!action || !matchesFilters(action, propertyFilter, channelFilter)) continue;
    const decision = decisionKey(row.decision);
    if (!decision) continue;
    const date = dayKey(row.created_at);
    const bucket = curationMap.get(date) ?? { date, approve: 0, kill: 0 };
    bucket[decision] += 1;
    curationMap.set(date, bucket);
    const operator = safeOperatorKey(row.operator_email);
    operatorKeys.add(operator);
    const operatorBucket = curationOperatorMap.get(date) ?? { date };
    operatorBucket[operator] = Number(operatorBucket[operator] ?? 0) + 1;
    curationOperatorMap.set(date, operatorBucket);
    curationByDay[date] = [
      ...(curationByDay[date] ?? []),
      { ...row, action },
    ];
  }

  const timeline = buildTimeline(experiments);
  const publishedResults = buildPublishedResults(manualResults, actionsById, propertyFilter, channelFilter);

  return NextResponse.json({
    costSeries: Array.from(costMap.values()).map(roundCosts),
    findingSeries: Array.from(findingMap.values()),
    curationSeries: Array.from(curationMap.values()),
    curationOperatorSeries: Array.from(curationOperatorMap.values()),
    operators: Array.from(operatorKeys),
    experiments: timeline,
    publishedResults,
    receipts: {
      costsByDay,
      findingsByDay,
      curationByDay,
      experimentsById: Object.fromEntries(experiments.map((experiment) => [experiment.id, experiment])),
      resultsByActionId: Object.fromEntries(publishedResults.map((item) => [item.action_id, item.results])),
    },
    counts: buildCounts(allFindings),
  });
}

function safeOperatorKey(value: string | null | undefined) {
  return (value ?? "unknown").replace(/[^a-zA-Z0-9@._-]/g, "_");
}

function buildPublishedResults(
  results: ResultRow[],
  actionsById: Map<string, ActionRow>,
  propertyFilter: string,
  channelFilter: string,
) {
  const grouped = new Map<string, ResultRow[]>();
  for (const result of results) {
    const actionId = result.raw?.action_id;
    if (!actionId) continue;
    const action = actionsById.get(actionId);
    if (!action || action.status !== "published" || !matchesFilters(action, propertyFilter, channelFilter)) continue;
    grouped.set(actionId, [...(grouped.get(actionId) ?? []), result]);
  }

  return Array.from(grouped.entries()).map(([actionId, rows]) => {
    const action = actionsById.get(actionId);
    return {
      action_id: actionId,
      title: action ? actionTitle(action) : "Published action",
      property: action?.property ?? "general",
      channel: normalizeChannel(action?.channel),
      metric: preferredResultMetric(rows),
      results: rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        metric: row.metric,
        value: Number(row.value ?? 0),
        checkpoint: row.raw?.checkpoint ?? "other",
        note: row.raw?.note ?? null,
      })),
    };
  });
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function providerKey(provider: string): ProviderKey {
  const normalized = provider.toLowerCase();
  if (normalized.includes("anthropic")) return "anthropic";
  if (normalized.includes("xai") || normalized.includes("grok")) return "xai";
  return "other";
}

function findingAgentKey(row: FindingRow): FindingAgentKey {
  const tags = row.tags ?? [];
  const agent = row.agent.toLowerCase();
  if (tags.includes("intake")) return "intake";
  if (agent.includes("lens")) return "lens";
  if (agent.includes("pulse")) return "pulse";
  return "scout";
}

function decisionKey(decision: string): DecisionKey | null {
  if (decision === "approve" || decision === "kill") return decision;
  return null;
}

function matchesFilters(row: { property?: string | null; channel?: string | null }, property: string, channel: string) {
  const rowChannel = normalizeChannel(row.channel);
  return (property === "all" || row.property === property) && (channel === "all" || rowChannel === channel);
}

function normalizeChannel(value: string | null | undefined) {
  const normalized = (value ?? "general").toLowerCase();
  if (normalized === "ig") return "instagram";
  if (normalized === "yt") return "youtube";
  if (normalized === "twitter") return "x";
  return normalized;
}

function buildCounts(rows: Array<{ property?: string | null; channel?: string | null }>) {
  const counts = {
    properties: { all: 0, store: 0, huh: 0, restaurant: 0, general: 0 } as Record<string, number>,
    channels: { all: 0, seo: 0, email: 0, tiktok: 0, instagram: 0, youtube: 0, x: 0, community: 0 },
  };

  for (const row of rows) {
    const property = row.property ?? "general";
    const channel = normalizeChannel(row.channel);
    counts.properties.all += 1;
    counts.properties[property] = (counts.properties[property] ?? 0) + 1;
    counts.channels.all += 1;
    if (channel === "seo" || channel === "email" || channel === "tiktok" || channel === "instagram" || channel === "youtube" || channel === "x" || channel === "community") {
      counts.channels[channel] += 1;
    }
  }

  return counts;
}

function roundCosts(row: { date: string; anthropic: number; xai: number; other: number; total: number }) {
  return {
    date: row.date,
    anthropic: Number(row.anthropic.toFixed(4)),
    xai: Number(row.xai.toFixed(4)),
    other: Number(row.other.toFixed(4)),
    total: Number(row.total.toFixed(4)),
  };
}

function buildTimeline(experiments: ExperimentRow[]) {
  if (experiments.length === 0) return [];

  const first = Math.min(...experiments.map((experiment) => new Date(experiment.created_at).getTime()));
  const today = Date.now();

  return experiments.map((experiment) => {
    const start = new Date(experiment.created_at).getTime();
    const end = experiment.verdict_at ? new Date(experiment.verdict_at).getTime() : today;
    const label = `${experiment.property}: ${experiment.hypothesis}`;

    return {
      id: experiment.id,
      label: label.length > 44 ? `${label.slice(0, 41)}...` : label,
      property: experiment.property,
      verdict: experiment.verdict ?? "undecided",
      start: dayKey(experiment.created_at),
      end: experiment.verdict_at ? dayKey(experiment.verdict_at) : dayKey(new Date(today).toISOString()),
      offsetDays: Math.max(0, Math.round((start - first) / DAY_MS)),
      durationDays: Math.max(1, Math.round((end - start) / DAY_MS) + 1),
    };
  });
}

function actionTitle(action: ActionRow) {
  const hook = action.payload.hook;
  const title = action.payload.title;
  if (typeof hook === "string" && hook.trim()) return hook;
  if (typeof title === "string" && title.trim()) return title;
  return `${action.property} ${action.kind}`;
}

function preferredResultMetric(results: ResultRow[]) {
  for (const metric of ["reach", "views", "profile_visits", "link_taps", "follows"]) {
    if (results.some((result) => result.metric === metric)) return metric;
  }
  return results[0]?.metric ?? "value";
}
