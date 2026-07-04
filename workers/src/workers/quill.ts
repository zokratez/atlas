import fs from "node:fs";
import { jobConfig, loadConfig } from "../lib/config.js";
import { inferChannel, normalizeChannel } from "../lib/channel.js";
import { atlasDb } from "../lib/db.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";
import { runComplianceGate } from "../lib/compliance.js";

type FindingRow = {
  id: string;
  created_at: string;
  property: string;
  claim: string;
  evidence: string | null;
  source_url: string | null;
  tags: string[] | null;
};

type Draft = {
  kind: "post" | "email" | "page";
  channel: string;
  title: string;
  hook: string;
  body: string;
  source_finding_ids?: string[];
  pattern_names?: string[];
};

type PatternRow = {
  id: string;
  property: string;
  channel: string;
  name: string;
  description: string | null;
  support_count: number;
  source_finding_ids: string[] | null;
  confidence: number | null;
  status: "emerging" | "validated" | "fading" | "busted";
};

type DecisionRow = {
  action_id: string | null;
  decision: "approve" | "kill" | "edit" | "revive";
  reason: string | null;
  operator_email: string | null;
};

type TasteDecision = {
  decision: "approve" | "kill";
  reason: string | null;
  excerpt: string;
  operator_email: string | null;
  role: "owner" | "curator" | "viewer" | "unknown";
  weight: number;
};

const quillSoulPath = "/Users/samoteo/.openclaw/agents/quill/SOUL.md";
const properties = ["store", "huh", "restaurant", "general"];

function voiceForProperty(property: string) {
  if (property === "store") {
    return "pain, truth, funny, real. Quiet proof. RUO only. Zero hype. No health, human-use, dosing, cosmetic, customer-results, or paid-ad targeting claims.";
  }

  if (property === "huh") {
    return "pain, truth, funny, real. Warm, anti-drill, Diego-adjacent, zero hype. Focus on the freeze before real Spanish conversations.";
  }

  return "pain, truth, funny, real. Specific, grounded, useful, zero hype.";
}

function buildSystemPrompt(property: string) {
  const quillSoul = fs.readFileSync(quillSoulPath, "utf8");
  return `${quillSoul}

Atlas Quill doctrine:
- Publishing is 100% manual. You draft only.
- Voice: ${voiceForProperty(property)}
- Drafts must feel written from source evidence, not from content templates.
- Return JSON arrays only.`;
}

function buildUserPrompt(
  property: string,
  findings: FindingRow[],
  patterns: PatternRow[],
  tasteDecisions: TasteDecision[],
  maxDrafts: number,
) {
  return `Draft content from these fresh Atlas findings.

Rules:
- Return a JSON array only.
- Max ${maxDrafts} drafts.
- Each draft object: kind, channel, title, hook, body, source_finding_ids, pattern_names.
- channel must be one of seo, email, tiktok, instagram, youtube, x, community, general.
- kind must be one of post, email, page.
- Keep each body under 90 words.
- Drafts must be human-gated and ready for Sam's queue.
- Store drafts must obey RUO-only framing.
- Huh drafts must not overpromise fluency or outcomes.
- Zero hype. Pain, truth, funny, real.

Property: ${property}
Sam taste memory:
${JSON.stringify(tasteDecisions, null, 2)}

Pattern ledger:
${JSON.stringify(patterns, null, 2)}

Findings:
${JSON.stringify(findings, null, 2)}`;
}

async function recentFindings(property: string) {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("id, created_at, property, claim, evidence, source_url, tags")
    .eq("property", property)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw error;
  return (data ?? []) as FindingRow[];
}

async function recentPatterns(property: string) {
  const { data, error } = await atlasDb()
    .from("patterns")
    .select("id, property, channel, name, description, support_count, source_finding_ids, confidence, status")
    .eq("property", property)
    .neq("status", "busted")
    .order("support_count", { ascending: false })
    .limit(20);

  if (isMissingPatternsError(error)) return [];
  if (error) throw error;
  return (data ?? []) as PatternRow[];
}

async function todaysActionCount(property: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { count, error } = await atlasDb()
    .from("actions")
    .select("id", { count: "exact", head: true })
    .eq("agent", "atlas-quill")
    .eq("property", property)
    .gte("created_at", start.toISOString());

  if (error) throw error;
  return count ?? 0;
}

async function recentTasteDecisions(property: string) {
  const { data: decisions, error } = await atlasDb()
    .from("decisions")
    .select("action_id, decision, reason, operator_email")
    .in("decision", ["approve", "kill"])
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw error;

  const rows = (decisions ?? []) as DecisionRow[];
  const actionIds = Array.from(new Set(rows.map((row) => row.action_id).filter(Boolean))) as string[];
  const operatorEmails = Array.from(new Set(rows.map((row) => row.operator_email).filter(Boolean))) as string[];
  if (actionIds.length === 0) return [];

  const { data: actions, error: actionError } = await atlasDb()
    .from("actions")
    .select("id, property, payload")
    .in("id", actionIds);

  if (actionError) throw actionError;

  const actionsById = new Map(
    (actions ?? []).map((action) => [
      action.id,
      action as { id: string; property: string; payload: Record<string, unknown> },
    ]),
  );
  const operatorsByEmail = new Map<string, "owner" | "curator" | "viewer">();
  if (operatorEmails.length > 0) {
    const { data: operators, error: operatorsError } = await atlasDb()
      .from("operators")
      .select("email, role")
      .in("email", operatorEmails);
    if (!isMissingOperatorsError(operatorsError) && operatorsError) throw operatorsError;
    for (const operator of operators ?? []) {
      if (operator.role === "owner" || operator.role === "curator" || operator.role === "viewer") {
        operatorsByEmail.set(operator.email, operator.role);
      }
    }
  }

  const weighted = rows
    .map((row) => {
      const action = row.action_id ? actionsById.get(row.action_id) : null;
      if (!action || action.property !== property || (row.decision !== "approve" && row.decision !== "kill")) {
        return null;
      }

      const role = row.operator_email ? operatorsByEmail.get(row.operator_email) ?? "unknown" : "unknown";
      const weight = role === "owner" ? 2 : 1;
      return {
        decision: row.decision,
        reason: row.reason,
        operator_email: row.operator_email,
        role,
        weight,
        excerpt: excerptPayload(action.payload),
      };
    })
    .filter((row): row is TasteDecision => Boolean(row))
    .flatMap((row) => Array.from({ length: row.weight }, () => row));

  return weighted.slice(0, 20);
}

function patternScore(draft: Draft, patterns: PatternRow[]) {
  const text = `${draft.title} ${draft.hook} ${draft.body}`.toLowerCase();
  const explicitNames = new Set((draft.pattern_names ?? []).map((name) => name.toLowerCase()));
  const matched = patterns.filter((pattern) => {
    const name = pattern.name.toLowerCase();
    const words = name.split(/\W+/).filter((word) => word.length > 3);
    const hasExplicitMatch = explicitNames.has(name);
    const hasTextMatch = words.length > 0 && words.some((word) => text.includes(word));
    return hasExplicitMatch || hasTextMatch;
  });

  const ranked = matched.sort((a, b) => patternWeight(b) - patternWeight(a)).slice(0, 6);
  const names = ranked.map((pattern) => `${pattern.name} (${pattern.status}, seen ${pattern.support_count}x)`);
  const score = ranked.reduce((sum, pattern) => sum + patternWeight(pattern), 0);
  return {
    count: names.length,
    score,
    source: "pattern-ledger",
    names,
    label: `matches ${names.length} proven patterns: ${names.length > 0 ? names.join(", ") : "none yet"}`,
    caveat: "prior, not prediction",
  };
}

function patternWeight(pattern: PatternRow) {
  const statusWeight = pattern.status === "validated" ? 3 : pattern.status === "emerging" ? 1 : 0.25;
  return statusWeight * Math.max(1, pattern.support_count) * Number(pattern.confidence ?? 0.5);
}

function excerptPayload(payload: Record<string, unknown>) {
  return [payload.title, payload.hook, payload.body, payload.caption]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" / ")
    .slice(0, 420);
}

function isMissingPatternsError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("patterns"));
}

function isMissingOperatorsError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("operators"));
}

async function insertDrafts(property: string, drafts: Draft[], patterns: PatternRow[]) {
  for (const draft of drafts) {
    const text = `${draft.title}\n${draft.hook}\n${draft.body}`;
    const compliance = runComplianceGate(property, text);
    const score = patternScore(draft, patterns);
    const channel = normalizeChannel(draft.channel);

    const { error } = await atlasDb().from("actions").insert({
      agent: "atlas-quill",
      property,
      kind: draft.kind,
      channel,
      payload: {
        title: draft.title,
        hook: draft.hook,
        body: draft.body,
        source_finding_ids: draft.source_finding_ids ?? [],
        pattern_ids: patterns
          .filter((pattern) => score.names.some((name) => name.startsWith(pattern.name)))
          .map((pattern) => pattern.id),
        pattern_score: score,
      },
      compliance_status: compliance.status,
      compliance_notes: compliance.notes,
      status: compliance.status === "passed" ? "pending" : "killed",
    });

    if (error) throw error;
  }
}

export async function main() {
  const config = loadConfig();
  const quillConfig = jobConfig(config, "quill");
  const governor = new ModelGovernor(quillConfig, createProvider(quillConfig));
  let inserted = 0;

  for (const property of properties) {
    const usedToday = await todaysActionCount(property);
    const remaining = Math.max(0, 5 - usedToday);
    if (remaining === 0) continue;

    const findings = await recentFindings(property);
    if (findings.length === 0) continue;
    const patterns = await recentPatterns(property);
    const tasteDecisions = await recentTasteDecisions(property);
    const mix = tasteDecisions.reduce((counts, decision) => {
      counts[decision.role] = (counts[decision.role] ?? 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    console.log(`atlas-quill tuning: ${tasteDecisions.length} weighted decisions informed ${property}; mix=${JSON.stringify(mix)}.`);

    const response = await governor.complete("atlas-quill", {
      system: buildSystemPrompt(property),
      maxTokens: 4000,
      temperature: 0.4,
      messages: [{ role: "user", content: buildUserPrompt(property, findings, patterns, tasteDecisions, remaining) }],
    });

    const drafts = parseJsonArray<Draft>(response.text)
      .filter((draft) => ["post", "email", "page"].includes(draft.kind) && draft.title && draft.body)
      .map((draft) => ({
        ...draft,
        channel: inferChannel({
          channel: draft.channel,
          tags: draft.pattern_names,
          text: `${draft.title} ${draft.hook} ${draft.body}`,
        }),
      }))
      .slice(0, remaining);

    await insertDrafts(property, drafts, patterns);
    inserted += drafts.length;
  }

  console.log(`atlas-quill prepared ${inserted} drafts.`);
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-quill stopped by governor: ${error.message}`);
    return;
  }

  console.error(error);
  process.exit(1);
});
