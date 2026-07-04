import { jobConfig, loadConfig } from "../lib/config.js";
import { inferChannel, normalizeChannel } from "../lib/channel.js";
import { atlasDb } from "../lib/db.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { parseJsonObject } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";

type PatternStatus = "emerging" | "validated" | "fading" | "busted";

type FindingRow = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  channel: string | null;
  claim: string;
  evidence: string | null;
  source_url: string | null;
  confidence: number | null;
  tags: string[] | null;
};

type LensFinding = {
  property: string;
  channel?: string;
  claim: string;
  evidence: string;
  source_url: string;
  confidence: number;
  tags: string[];
};

type PatternDraft = {
  property: string;
  channel?: string;
  name: string;
  description: string;
  source_finding_ids: string[];
  confidence: number;
};

type LensResponse = {
  summary_findings: LensFinding[];
  patterns: PatternDraft[];
};

type PatternRow = {
  id: string;
  created_at: string;
  updated_at: string;
  property: string;
  channel: string;
  name: string;
  description: string | null;
  support_count: number;
  source_finding_ids: string[] | null;
  confidence: number | null;
  status: PatternStatus;
};

type ResultRow = {
  id: string;
  metric: string;
  value: number;
  raw: { action_id?: string; checkpoint?: string } | null;
};

type ActionRow = {
  id: string;
  payload: { pattern_ids?: unknown } | null;
};

type SpecimenRow = {
  id: string;
  observed_metrics: { views?: number | null } | null;
  mechanics: string[] | null;
  authenticity: "high" | "medium" | "low" | "unknown" | null;
  pattern_ids: string[] | null;
};

const allowedProperties = new Set(["store", "huh", "restaurant", "general"]);

async function recentFindings() {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("id, created_at, agent, property, channel, claim, evidence, source_url, confidence, tags")
    .not("agent", "eq", "atlas-lens")
    .order("created_at", { ascending: false })
    .limit(80);

  if (isMissingChannelError(error)) {
    const fallback = await atlasDb()
      .from("findings")
      .select("id, created_at, agent, property, claim, evidence, source_url, confidence, tags")
      .not("agent", "eq", "atlas-lens")
      .order("created_at", { ascending: false })
      .limit(80);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []) as FindingRow[];
  }
  if (error) throw error;
  return (data ?? []) as FindingRow[];
}

async function existingPatterns() {
  const { data, error } = await atlasDb()
    .from("patterns")
    .select("id, created_at, updated_at, property, channel, name, description, support_count, source_finding_ids, confidence, status");

  if (isMissingPatternsError(error)) return [];
  if (error) throw error;
  return (data ?? []) as PatternRow[];
}

function buildUserPrompt(findings: FindingRow[]) {
  return `You are Atlas Lens v2. Cluster marketing findings by underlying mechanic, not by wording.

Return one JSON object only:
{
  "summary_findings": [],
  "patterns": []
}

summary_findings:
- Max 5.
- Each object: property, channel, claim, evidence, source_url, confidence, tags.
- Every tag array includes "lens".

patterns:
- Max 12.
- Each object: property, channel, name, description, source_finding_ids, confidence.
- property must be one of store, huh, restaurant, general.
- channel must be one of seo, email, tiktok, instagram, youtube, x, community, general.
- name should describe the reusable mechanic, not the surface wording.
- source_finding_ids must only use ids present in Recent findings.
- Prefer patterns supported by independent source URLs.

Recent findings:
${JSON.stringify(findings, null, 2)}`;
}

async function insertLensFindings(findings: LensFinding[]) {
  if (findings.length === 0) return;

  const rows = findings.map((finding) => ({
      agent: "atlas-lens",
      property: normalizeProperty(finding.property, finding.tags),
      channel: inferChannel({
        channel: finding.channel,
        tags: finding.tags,
        sourceUrl: finding.source_url,
        text: `${finding.claim} ${finding.evidence}`,
      }),
      claim: finding.claim,
      evidence: finding.evidence,
      source_url: finding.source_url,
      confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.5))),
      tags: Array.from(new Set([...(finding.tags ?? []), "lens"])),
    }));

  const { error } = await atlasDb().from("findings").insert(rows);
  if (isMissingChannelError(error)) {
    const { error: retryError } = await atlasDb()
      .from("findings")
      .insert(rows.map(({ channel: _channel, ...row }) => row));
    if (retryError) throw retryError;
    return;
  }

  if (error) throw error;
}

async function upsertPatterns(drafts: PatternDraft[], findings: FindingRow[]) {
  if (drafts.length === 0) return 0;

  const existing = await existingPatterns();
  if (existing.length === 0 && drafts.length > 0) {
    const probe = await atlasDb().from("patterns").select("id").limit(1);
    if (isMissingPatternsError(probe.error)) return 0;
    if (probe.error) throw probe.error;
  }
  const existingByKey = new Map(existing.map((pattern) => [patternKey(pattern), pattern]));
  const validFindingIds = new Set(findings.map((finding) => finding.id));
  const now = new Date().toISOString();
  let changed = 0;

  for (const draft of drafts) {
    const sourceIds = Array.from(
      new Set((draft.source_finding_ids ?? []).filter((id) => validFindingIds.has(id))),
    );
    if (!draft.name || sourceIds.length === 0) continue;

    const property = normalizeProperty(draft.property, []);
    const channel = normalizeChannel(draft.channel);
    const normalizedDraft = {
      property,
      channel,
      name: draft.name.trim(),
      description: draft.description?.trim() ?? "",
    };
    const key = patternKey(normalizedDraft);
    const current = existingByKey.get(key);
    const supportIds = Array.from(new Set([...(current?.source_finding_ids ?? []), ...sourceIds]));
    const supportCount = supportIds.length;
    const status = nextStatus(current?.status ?? "emerging", supportCount);
    const confidence = Math.max(0, Math.min(1, Number(draft.confidence ?? current?.confidence ?? 0.5)));

    if (current) {
      const { error } = await atlasDb()
        .from("patterns")
        .update({
          updated_at: now,
          description: normalizedDraft.description || current.description,
          support_count: supportCount,
          source_finding_ids: supportIds,
          confidence,
          status,
        })
        .eq("id", current.id);

      if (error) throw error;
    } else {
      const { error } = await atlasDb().from("patterns").insert({
        property,
        channel,
        name: normalizedDraft.name,
        description: normalizedDraft.description,
        support_count: supportCount,
        source_finding_ids: supportIds,
        confidence,
        status,
      });

      if (isMissingPatternsError(error)) return changed;
      if (error) throw error;
    }

    changed += 1;
  }

  await markFadingPatterns();
  await markBustedFromResults();
  await annotatePatternsWithResults();
  await linkSpecimensToPatterns();
  return changed;
}

async function annotatePatternsWithResults() {
  const { data: patterns, error: patternsError } = await atlasDb()
    .from("patterns")
    .select("id, name, description");

  if (isMissingPatternsError(patternsError)) return;
  if (patternsError) throw patternsError;

  const { data: actions, error: actionsError } = await atlasDb()
    .from("actions")
    .select("id, payload")
    .eq("status", "published");

  if (actionsError) throw actionsError;

  const { data: results, error: resultsError } = await atlasDb()
    .from("results")
    .select("id, metric, value, raw")
    .eq("source", "manual");

  if (resultsError) throw resultsError;

  const resultsByActionId = new Map<string, ResultRow[]>();
  for (const result of (results ?? []) as ResultRow[]) {
    const actionId = result.raw?.action_id;
    if (!actionId) continue;
    resultsByActionId.set(actionId, [...(resultsByActionId.get(actionId) ?? []), result]);
  }

  const resultsByPatternId = new Map<string, ResultRow[]>();
  for (const action of (actions ?? []) as ActionRow[]) {
    const patternIds = Array.isArray(action.payload?.pattern_ids) ? action.payload.pattern_ids : [];
    const actionResults = resultsByActionId.get(action.id) ?? [];
    for (const patternId of patternIds) {
      if (typeof patternId !== "string") continue;
      resultsByPatternId.set(patternId, [...(resultsByPatternId.get(patternId) ?? []), ...actionResults]);
    }
  }

  for (const pattern of patterns ?? []) {
    const patternResults = resultsByPatternId.get(pattern.id) ?? [];
    if (patternResults.length === 0) continue;

    const preferred = preferredResultMetric(patternResults);
    const avg = average(patternResults.filter((result) => result.metric === preferred).map((result) => Number(result.value)));
    const actionCount = new Set(patternResults.map((result) => result.raw?.action_id).filter(Boolean)).size;
    const annotation = `Reality: ${actionCount} published tests, avg ${preferred} ${Math.round(avg)}. n is tiny, directional only.`;
    const baseDescription = String(pattern.description ?? "").replace(/\s*Reality: .*?directional only\.\s*$/i, "").trim();

    const { error } = await atlasDb()
      .from("patterns")
      .update({
        description: [baseDescription, annotation].filter(Boolean).join(" "),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pattern.id);

    if (error) throw error;
  }
}

async function linkSpecimensToPatterns() {
  const { data: patterns, error: patternsError } = await atlasDb()
    .from("patterns")
    .select("id, name, description");

  if (isMissingPatternsError(patternsError)) return;
  if (patternsError) throw patternsError;

  const { data: specimens, error: specimensError } = await atlasDb()
    .from("specimens")
    .select("id, observed_metrics, mechanics, authenticity, pattern_ids");

  if (isMissingSpecimensError(specimensError)) return;
  if (specimensError) throw specimensError;

  const matchedByPattern = new Map<string, SpecimenRow[]>();
  for (const specimen of (specimens ?? []) as SpecimenRow[]) {
    const mechanicsText = (specimen.mechanics ?? []).join(" ").toLowerCase();
    const matchedPatternIds = (patterns ?? [])
      .filter((pattern) => pattern.name && mechanicsText.includes(String(pattern.name).toLowerCase().split(/\W+/)[0] ?? ""))
      .map((pattern) => pattern.id);
    const nextPatternIds = Array.from(new Set([...(specimen.pattern_ids ?? []), ...matchedPatternIds]));

    if (nextPatternIds.length > (specimen.pattern_ids ?? []).length) {
      const { error } = await atlasDb()
        .from("specimens")
        .update({ pattern_ids: nextPatternIds })
        .eq("id", specimen.id);
      if (error) throw error;
    }

    if (specimen.authenticity === "low") continue;
    for (const patternId of nextPatternIds) {
      matchedByPattern.set(patternId, [...(matchedByPattern.get(patternId) ?? []), specimen]);
    }
  }

  for (const pattern of patterns ?? []) {
    const matched = matchedByPattern.get(pattern.id) ?? [];
    const views = matched
      .map((specimen) => Number(specimen.observed_metrics?.views))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (views.length === 0) continue;

    const min = Math.min(...views);
    const max = Math.max(...views);
    const annotation = `Observed range: ${compactNumber(min)}-${compactNumber(max)} views across ${matched.length} specimens. engagement != conversion - observed public performance only.`;
    const baseDescription = String(pattern.description ?? "").replace(/\s*Observed range: .*?observed public performance only\.\s*$/i, "").trim();
    const { error } = await atlasDb()
      .from("patterns")
      .update({
        description: [baseDescription, annotation].filter(Boolean).join(" "),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pattern.id);
    if (error) throw error;
  }
}

async function markFadingPatterns() {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await atlasDb()
    .from("patterns")
    .update({ status: "fading" })
    .lt("updated_at", cutoff)
    .in("status", ["emerging", "validated"]);

  if (isMissingPatternsError(error)) return;
  if (error) throw error;
}

async function markBustedFromResults() {
  const { data, error } = await atlasDb()
    .from("results")
    .select("raw")
    .or("raw->>pattern_status.eq.busted,raw->>verdict.eq.busted");

  if (error) throw error;

  const bustedIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => (row.raw as { pattern_id?: unknown } | null)?.pattern_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  if (bustedIds.length === 0) return;

  const { error: updateError } = await atlasDb()
    .from("patterns")
    .update({ status: "busted", updated_at: new Date().toISOString() })
    .in("id", bustedIds);

  if (isMissingPatternsError(updateError)) return;
  if (updateError) throw updateError;
}

export async function main() {
  const config = loadConfig();
  const lensConfig = jobConfig(config, "lens");
  const findings = await recentFindings();

  if (findings.length === 0) {
    console.log("atlas-lens found no findings to summarize.");
    return;
  }

  const governor = new ModelGovernor(lensConfig, createProvider(lensConfig));
  const response = await governor.complete("atlas-lens", {
    system:
      "You are Atlas Lens v2, the pattern-ledger pass over Atlas findings. Return only one JSON object.",
    maxTokens: 3000,
    temperature: 0.1,
    messages: [{ role: "user", content: buildUserPrompt(findings) }],
  });

  const parsed = await parseLensResponse(response.text, governor);
  const summaries = (parsed.summary_findings ?? []).slice(0, 5);
  const changedPatterns = await upsertPatterns((parsed.patterns ?? []).slice(0, 12), findings);
  await insertLensFindings(summaries);
  console.log(`atlas-lens prepared ${summaries.length} summary findings and ${changedPatterns} pattern updates.`);
}

async function parseLensResponse(text: string, governor: ModelGovernor) {
  try {
    return parseJsonObject<LensResponse>(text);
  } catch (error) {
    const repair = await governor.complete("atlas-lens", {
      system: "Repair invalid JSON. Return only one valid JSON object with summary_findings and patterns arrays.",
      maxTokens: 3000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `Repair this into valid JSON only. Do not add prose.\n\n${text.slice(0, 18000)}`,
        },
      ],
    });
    return parseJsonObject<LensResponse>(repair.text);
  }
}

function normalizeProperty(property: string | null | undefined, tags: string[] | null | undefined) {
  if (property && allowedProperties.has(property)) return property;
  if (tags?.some((tag) => tag.includes("huh") || tag.includes("language"))) return "huh";
  if (tags?.some((tag) => tag.includes("store") || tag.includes("peptide"))) return "store";
  return "general";
}

function nextStatus(current: PatternStatus, supportCount: number): PatternStatus {
  if (current === "busted") return "busted";
  if (supportCount >= 3) return "validated";
  if (current === "fading" && supportCount >= 3) return "validated";
  return "emerging";
}

function patternKey(pattern: { property: string; channel: string; name: string }) {
  return `${pattern.property}:${pattern.channel}:${pattern.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function preferredResultMetric(results: ResultRow[]) {
  for (const metric of ["reach", "views", "profile_visits", "link_taps", "follows"]) {
    if (results.some((result) => result.metric === metric)) return metric;
  }
  return results[0]?.metric ?? "value";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isMissingPatternsError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("patterns"));
}

function isMissingChannelError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("channel"));
}

function isMissingSpecimensError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("specimens"));
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(Math.round(value));
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-lens stopped by governor: ${error.message}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
