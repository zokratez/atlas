import { NextResponse } from "next/server";
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
};

type ActionRow = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  kind: string;
  channel: string | null;
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

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const [costsResult, findingsResult, decisionsResult, experimentsResult] = await Promise.all([
    atlasDb().from("costs").select("id, created_at, agent, provider, tokens_in, tokens_out, usd").order("created_at"),
    atlasDb()
      .from("findings")
      .select("id, created_at, agent, property, claim, evidence, source_url, confidence, tags")
      .order("created_at"),
    atlasDb().from("decisions").select("id, created_at, action_id, decision, reason").order("created_at"),
    atlasDb()
      .from("experiments")
      .select("id, created_at, property, hypothesis, action, metric, verdict, verdict_at, notes")
      .order("created_at"),
  ]);

  if (costsResult.error) throw costsResult.error;
  if (findingsResult.error) throw findingsResult.error;
  if (decisionsResult.error) throw decisionsResult.error;
  if (experimentsResult.error) throw experimentsResult.error;

  const decisions = (decisionsResult.data ?? []) as DecisionRow[];
  const actionIds = Array.from(new Set(decisions.map((decision) => decision.action_id).filter(Boolean))) as string[];
  const actionsById = new Map<string, ActionRow>();

  if (actionIds.length > 0) {
    const { data, error } = await atlasDb()
      .from("actions")
      .select("id, created_at, agent, property, kind, channel, payload, status, compliance_status")
      .in("id", actionIds);

    if (error) throw error;
    for (const action of (data ?? []) as ActionRow[]) actionsById.set(action.id, action);
  }

  const costs = (costsResult.data ?? []) as CostRow[];
  const findings = (findingsResult.data ?? []) as FindingRow[];
  const experiments = (experimentsResult.data ?? []) as ExperimentRow[];

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
  for (const row of decisions) {
    const decision = decisionKey(row.decision);
    if (!decision) continue;
    const date = dayKey(row.created_at);
    const bucket = curationMap.get(date) ?? { date, approve: 0, kill: 0 };
    bucket[decision] += 1;
    curationMap.set(date, bucket);
    curationByDay[date] = [
      ...(curationByDay[date] ?? []),
      { ...row, action: row.action_id ? actionsById.get(row.action_id) ?? null : null },
    ];
  }

  const timeline = buildTimeline(experiments);

  return NextResponse.json({
    costSeries: Array.from(costMap.values()).map(roundCosts),
    findingSeries: Array.from(findingMap.values()),
    curationSeries: Array.from(curationMap.values()),
    experiments: timeline,
    receipts: {
      costsByDay,
      findingsByDay,
      curationByDay,
      experimentsById: Object.fromEntries(experiments.map((experiment) => [experiment.id, experiment])),
    },
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
