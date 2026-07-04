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

type Cadence = "weekly" | "monthly" | "quarterly";

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
  property?: string;
  channel?: string | null;
  status?: string;
  payload: { pattern_ids?: unknown; title?: unknown; hook?: unknown; body?: unknown; caption?: unknown } | null;
};

type SleeperSignal = {
  action_id: string;
  title: string;
  metric: string;
  latest_checkpoint: string;
  latest_value: number;
  earlier_value: number;
  ratio: number;
  pattern_ids: string[];
  result_id: string;
};

type SpecimenRow = {
  id: string;
  observed_metrics: { views?: number | null } | null;
  mechanics: string[] | null;
  authenticity: "high" | "medium" | "low" | "unknown" | null;
  pattern_ids: string[] | null;
  is_own?: boolean | null;
  action_id?: string | null;
};

type AssetRow = {
  id: string;
  property: string;
  kind: "video" | "image" | "text";
  title: string;
  description: string | null;
  duration_seconds: number | null;
  intended_channels: string[] | null;
};

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
  await recommendShelfAssets();
  return changed;
}

async function recommendShelfAssets() {
  const { data: assets, error: assetsError } = await atlasDb()
    .from("assets")
    .select("id, property, kind, title, description, duration_seconds, intended_channels")
    .eq("status", "shelf");

  if (isMissingAssetsError(assetsError)) return;
  if (assetsError) throw assetsError;

  const patterns = await existingPatterns();
  const { data: results, error: resultsError } = await atlasDb()
    .from("results")
    .select("id, metric, value, raw, created_at")
    .eq("source", "manual")
    .limit(100);

  if (resultsError) throw resultsError;

  for (const asset of (assets ?? []) as AssetRow[]) {
    const propertyPatterns = patterns
      .filter((pattern) => pattern.property === asset.property && pattern.status !== "busted")
      .sort((a, b) => b.support_count - a.support_count);
    const bestPattern = propertyPatterns[0];
    const channel = chooseAssetChannel(asset, bestPattern);
    const recommendation = {
      best_window: bestWindow(channel),
      channel,
      format_note: formatNote(asset),
      confidence: bestPattern ? Math.min(0.9, 0.45 + bestPattern.support_count / 20) : 0.35,
      receipts: [
        ...(bestPattern ? [bestPattern.id] : []),
        ...((results ?? []).slice(0, 3).map((result) => result.id)),
      ],
      rationale: bestPattern
        ? `Matched to pattern "${bestPattern.name}" (${bestPattern.status}, seen ${bestPattern.support_count}x).`
        : "No strong pattern yet; use safest channel/default timing.",
    };

    const { error } = await atlasDb()
      .from("assets")
      .update({ recommendation })
      .eq("id", asset.id);

    if (error) throw error;
  }
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

  let specimensResult = await atlasDb()
    .from("specimens")
    .select("id, observed_metrics, mechanics, authenticity, pattern_ids, is_own, action_id");

  if (isMissingOwnSpecimenColumnsError(specimensResult.error)) {
    specimensResult = await atlasDb()
      .from("specimens")
      .select("id, observed_metrics, mechanics, authenticity, pattern_ids");
  }

  if (isMissingSpecimensError(specimensResult.error)) return;
  if (specimensResult.error) throw specimensResult.error;

  const matchedByPattern = new Map<string, SpecimenRow[]>();
  for (const specimen of (specimensResult.data ?? []) as SpecimenRow[]) {
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

    if (specimen.authenticity === "low" || specimen.is_own === true) continue;
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
  const cadence = cadenceFromArgs();
  const governor = new ModelGovernor(lensConfig, createProvider(lensConfig));

  if (cadence) {
    await runCadence(cadence, governor);
    return;
  }

  const findings = await recentFindings();

  if (findings.length === 0) {
    console.log("atlas-lens found no findings to summarize.");
    return;
  }

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

function cadenceFromArgs(): Cadence | null {
  const index = process.argv.indexOf("--cadence");
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value === "weekly" || value === "monthly" || value === "quarterly" ? value : null;
}

async function runCadence(cadence: Cadence, governor: ModelGovernor) {
  if (cadence === "monthly") {
    await markFadingPatterns();
  }

  const sleepers = cadence === "weekly" ? await detectSleepers() : { risers: [], faders: [] };
  const yoursVsMarket = cadence === "weekly" ? await buildYoursVsMarketContext() : null;
  if (cadence === "weekly") {
    await reweightRiserPatterns(sleepers.risers);
  }

  const [patternsResult, decisionsResult, resultsResult, costsResult, findingsResult] = await Promise.all([
    atlasDb().from("patterns").select("id, property, channel, name, status, support_count, updated_at").order("updated_at", { ascending: false }).limit(30),
    atlasDb().from("decisions").select("id, decision, reason, operator_email, created_at").order("created_at", { ascending: false }).limit(60),
    atlasDb().from("results").select("id, property, channel, metric, value, raw, created_at").order("created_at", { ascending: false }).limit(60),
    atlasDb().from("costs").select("id, agent, provider, usd, created_at").order("created_at", { ascending: false }).limit(80),
    atlasDb().from("findings").select("id, property, channel, claim, tags, created_at").order("created_at", { ascending: false }).limit(80),
  ]);

  if (patternsResult.error && !isMissingPatternsError(patternsResult.error)) throw patternsResult.error;
  if (decisionsResult.error) throw decisionsResult.error;
  if (resultsResult.error) throw resultsResult.error;
  if (costsResult.error) throw costsResult.error;
  if (findingsResult.error) throw findingsResult.error;

  const receiptIds = {
    pattern_ids: (patternsResult.data ?? []).slice(0, 8).map((row) => row.id),
    decision_ids: (decisionsResult.data ?? []).slice(0, 8).map((row) => row.id),
    result_ids: (resultsResult.data ?? []).slice(0, 8).map((row) => row.id),
    cost_ids: (costsResult.data ?? []).slice(0, 8).map((row) => row.id),
    finding_ids: (findingsResult.data ?? []).slice(0, 8).map((row) => row.id),
  };

  const prompt = cadencePrompt(cadence, {
    patterns: patternsResult.data ?? [],
    decisions: decisionsResult.data ?? [],
    results: resultsResult.data ?? [],
    costs: costsResult.data ?? [],
    findings: findingsResult.data ?? [],
    sleeper_detection: sleepers,
    yours_vs_market: yoursVsMarket,
    receiptIds,
  });

  const response = await governor.complete(`atlas-lens-${cadence}`, {
    system: "You are Atlas Rhythm. Write one concise pinned finding. Suggest only; never apply changes.",
    maxTokens: 900,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const { error } = await atlasDb().from("findings").insert({
    agent: `atlas-lens-${cadence}`,
    property: "general",
    channel: "general",
    claim: cadenceTitle(cadence),
    evidence: `${response.text.trim()}\n\nReceipts: ${JSON.stringify(receiptIds)}`,
    source_url: null,
    confidence: 0.8,
    tags: ["lens", cadence, "cadence"],
    pinned: true,
    cadence,
  });

  if (isMissingPinnedError(error)) {
    const { error: retryError } = await atlasDb().from("findings").insert({
      agent: `atlas-lens-${cadence}`,
      property: "general",
      channel: "general",
      claim: cadenceTitle(cadence),
      evidence: `${response.text.trim()}\n\nReceipts: ${JSON.stringify(receiptIds)}`,
      source_url: null,
      confidence: 0.8,
      tags: ["lens", cadence, "cadence"],
    });
    if (retryError) throw retryError;
  } else if (error) {
    throw error;
  }

  console.log(`atlas-lens ${cadence} cadence finding written with receipts.`);
}

async function detectSleepers(): Promise<{ risers: SleeperSignal[]; faders: SleeperSignal[] }> {
  const { data: results, error: resultsError } = await atlasDb()
    .from("results")
    .select("id, metric, value, raw")
    .eq("source", "manual");

  if (resultsError) throw resultsError;

  const typedResults = (results ?? []) as ResultRow[];
  const actionIds = Array.from(new Set(typedResults.map((result) => result.raw?.action_id).filter(Boolean))) as string[];
  if (actionIds.length === 0) return { risers: [], faders: [] };

  const { data: actions, error: actionsError } = await atlasDb()
    .from("actions")
    .select("id, property, channel, status, payload")
    .in("id", actionIds)
    .eq("status", "published");

  if (actionsError) throw actionsError;

  const actionsById = new Map((actions ?? []).map((action) => [action.id, action as ActionRow]));
  const grouped = new Map<string, ResultRow[]>();
  for (const result of typedResults) {
    const actionId = result.raw?.action_id;
    if (!actionId || !actionsById.has(actionId)) continue;
    const key = `${actionId}:${result.metric}`;
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }

  const risers: SleeperSignal[] = [];
  const faders: SleeperSignal[] = [];
  for (const rows of grouped.values()) {
    const ordered = rows
      .filter((row) => checkpointOrder(row.raw?.checkpoint) > 0)
      .sort((a, b) => checkpointOrder(a.raw?.checkpoint) - checkpointOrder(b.raw?.checkpoint));
    if (ordered.length < 2) continue;

    const latest = ordered[ordered.length - 1];
    const earlierRows = ordered.slice(0, -1);
    const earlierValue = Math.max(...earlierRows.map((row) => Number(row.value ?? 0)));
    const latestValue = Number(latest.value ?? 0);
    if (!Number.isFinite(earlierValue) || earlierValue <= 0 || !Number.isFinite(latestValue)) continue;

    const ratio = latestValue / earlierValue;
    const actionId = latest.raw?.action_id;
    const action = actionId ? actionsById.get(actionId) : null;
    if (!actionId || !action) continue;
    const signal = {
      action_id: actionId,
      title: actionTitle(action),
      metric: latest.metric,
      latest_checkpoint: latest.raw?.checkpoint ?? "unknown",
      latest_value: latestValue,
      earlier_value: earlierValue,
      ratio: Number(ratio.toFixed(2)),
      pattern_ids: patternIdsFromAction(action),
      result_id: latest.id,
    };

    if (checkpointOrder(latest.raw?.checkpoint) >= checkpointOrder("7d") && ratio >= 1.25) {
      risers.push(signal);
    } else if (ratio <= 0.7) {
      faders.push(signal);
    }
  }

  return {
    risers: risers.sort((a, b) => b.ratio - a.ratio).slice(0, 5),
    faders: faders.sort((a, b) => a.ratio - b.ratio).slice(0, 5),
  };
}

async function reweightRiserPatterns(risers: SleeperSignal[]) {
  const boosts = new Map<string, SleeperSignal[]>();
  for (const riser of risers) {
    for (const patternId of riser.pattern_ids) {
      boosts.set(patternId, [...(boosts.get(patternId) ?? []), riser]);
    }
  }

  for (const [patternId, signals] of boosts.entries()) {
    const { data: pattern, error } = await atlasDb()
      .from("patterns")
      .select("id, description, support_count, confidence")
      .eq("id", patternId)
      .single();

    if (isMissingPatternsError(error)) return;
    if (error) throw error;

    const description = String(pattern.description ?? "");
    const freshSignals = signals.filter((signal) => !description.includes(`[sleeper:${signal.result_id}]`));
    if (freshSignals.length === 0) continue;

    const markers = freshSignals
      .map((signal) => `[sleeper:${signal.result_id}] late ${signal.metric} ${signal.latest_checkpoint} ${signal.ratio}x on "${signal.title}"`)
      .join(" ");
    const { error: updateError } = await atlasDb()
      .from("patterns")
      .update({
        support_count: Number(pattern.support_count ?? 0) + freshSignals.length,
        confidence: Math.min(0.95, Number(pattern.confidence ?? 0.5) + freshSignals.length * 0.03),
        description: [description, `Sleeper boost: ${markers}`].filter(Boolean).join(" "),
        updated_at: new Date().toISOString(),
      })
      .eq("id", patternId);

    if (updateError) throw updateError;
  }
}

async function buildYoursVsMarketContext() {
  let specimensResult = await atlasDb()
    .from("specimens")
    .select("id, property, channel, mechanics, observed_metrics, action_id, pattern_ids, dissection, is_own")
    .eq("is_own", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (isMissingOwnSpecimenColumnsError(specimensResult.error) || isMissingSpecimensError(specimensResult.error)) {
    return { own_specimens: [], own_results: [], validated_patterns: [], notes: ["own specimen columns not live yet"] };
  }
  if (specimensResult.error) throw specimensResult.error;

  const ownSpecimens = (specimensResult.data ?? []) as Array<SpecimenRow & {
    property?: string;
    channel?: string | null;
    dissection?: string | null;
  }>;
  const actionIds = Array.from(new Set(ownSpecimens.map((specimen) => specimen.action_id).filter(Boolean))) as string[];
  const patternIds = Array.from(new Set(ownSpecimens.flatMap((specimen) => specimen.pattern_ids ?? [])));

  const [resultsResult, patternsResult] = await Promise.all([
    actionIds.length > 0
      ? atlasDb().from("results").select("id, property, channel, metric, value, raw, created_at").eq("source", "manual").in("raw->>action_id", actionIds).limit(60)
      : Promise.resolve({ data: [], error: null }),
    atlasDb().from("patterns").select("id, property, channel, name, description, support_count, status, source_finding_ids").in("status", ["validated", "emerging"]).limit(40),
  ]);

  if (resultsResult.error) throw resultsResult.error;
  if (patternsResult.error && !isMissingPatternsError(patternsResult.error)) throw patternsResult.error;

  const marketPatterns = ((patternsResult.data ?? []) as PatternRow[])
    .filter((pattern) => pattern.status === "validated" || patternIds.includes(pattern.id))
    .sort((a, b) => b.support_count - a.support_count)
    .slice(0, 12);

  return {
    own_specimens: ownSpecimens.map((specimen) => ({
      id: specimen.id,
      action_id: specimen.action_id,
      property: specimen.property,
      channel: specimen.channel,
      mechanics: specimen.mechanics ?? [],
      observed_metrics: specimen.observed_metrics,
      pattern_ids: specimen.pattern_ids ?? [],
      dissection: specimen.dissection,
    })),
    own_results: resultsResult.data ?? [],
    validated_patterns: marketPatterns.map((pattern) => ({
      id: pattern.id,
      property: pattern.property,
      channel: pattern.channel,
      name: pattern.name,
      support_count: pattern.support_count,
      description: pattern.description,
      source_finding_ids: pattern.source_finding_ids ?? [],
    })),
  };
}

function cadencePrompt(cadence: Cadence, context: Record<string, unknown>) {
  if (cadence === "quarterly") {
    return `Write a skeleton reminder finding: "quarterly review due: strategy doc vs results." Include why the human ritual matters, in one paragraph. Context: ${JSON.stringify(context, null, 2)}`;
  }
  if (cadence === "monthly") {
    return `Write the monthly Atlas rhythm finding. Cover pattern lifecycle audit, experiment verdicts due, config-target suggestions based on kept content. Suggest only, never self-apply. Context: ${JSON.stringify(context, null, 2)}`;
  }
  return `Write "The Week" as one pinned Atlas finding: patterns risen/fallen, sleeper risers (late momentum) and faders (decay), best/worst published post by logged results, kill-reason trends, cost summary, and exactly ONE suggested tweak. Include a section called "Yours vs the market" comparing Sam's own posts' mechanics/results against validated market patterns. Give 1-3 concrete improvement notes with receipts, e.g. "your hook ran 6s; validated pattern: <2s - seen 9x." Note that risers count more because they survived algorithm decay. Suggest only, never self-apply. Context: ${JSON.stringify(context, null, 2)}`;
}

function cadenceTitle(cadence: Cadence) {
  if (cadence === "weekly") return "The Week";
  if (cadence === "monthly") return "Monthly rhythm audit";
  return "Quarterly review due: strategy doc vs results";
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
  if (property && slugify(property)) return slugify(property);
  if (tags?.some((tag) => tag.includes("huh") || tag.includes("language"))) return "huh";
  if (tags?.some((tag) => tag.includes("store") || tag.includes("peptide"))) return "store";
  return "general";
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

function checkpointOrder(value: string | null | undefined) {
  if (value === "24h") return 1;
  if (value === "72h") return 2;
  if (value === "7d") return 3;
  if (value === "30d") return 4;
  return 0;
}

function patternIdsFromAction(action: ActionRow) {
  const ids = Array.isArray(action.payload?.pattern_ids) ? action.payload.pattern_ids : [];
  return ids.filter((id): id is string => typeof id === "string");
}

function actionTitle(action: ActionRow) {
  const hook = action.payload?.hook;
  const title = action.payload?.title;
  if (typeof hook === "string" && hook.trim()) return hook;
  if (typeof title === "string" && title.trim()) return title;
  return action.id;
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

function isMissingOwnSpecimenColumnsError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("is_own") || error?.message?.includes("action_id"));
}

function isMissingAssetsError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("assets"));
}

function isMissingPinnedError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("pinned") || error?.message?.includes("cadence"));
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(Math.round(value));
}

function chooseAssetChannel(asset: AssetRow, pattern: PatternRow | undefined) {
  const intended = (asset.intended_channels ?? []).map((channel) => normalizeChannel(channel));
  if (pattern && intended.includes(pattern.channel as ReturnType<typeof normalizeChannel>)) return pattern.channel;
  if (intended.length > 0) return intended[0];
  return pattern?.channel ?? "general";
}

function bestWindow(channel: string) {
  if (channel === "email") return "weekday morning";
  if (channel === "tiktok" || channel === "instagram" || channel === "youtube") return "evening test window";
  if (channel === "x") return "weekday lunch or evening";
  return "next available manual slot";
}

function formatNote(asset: AssetRow) {
  if (asset.kind === "video") {
    if (asset.duration_seconds && asset.duration_seconds > 20) return "trim to <20s; hook in first 2s";
    return "hook in first 2s; keep the first frame readable";
  }
  if (asset.kind === "image") return "lead with the visible proof; caption supplies context";
  return "open with the problem; keep one idea per post";
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-lens stopped by governor: ${error.message}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
