import fs from "node:fs";
import { jobConfig, loadConfig } from "../lib/config.js";
import { inferChannel, normalizeChannel } from "../lib/channel.js";
import { atlasDb } from "../lib/db.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";
import { runComplianceGate } from "../lib/compliance.js";
import { isDirectRun } from "../lib/env.js";

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
  production_note?: string;
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

type GateFailureNote = {
  title: string | null;
  hook: string | null;
  body: string | null;
  compliance_notes: string | null;
};

const quillSoulPath = "/Users/samoteo/.openclaw/agents/quill/SOUL.md";
const competitorNames = [
  "duolingo",
  "speak",
  "praktika",
  "jumpspeak",
  "peptide sciences",
  "limitless life",
  "swiss chems",
  "marek health",
  "function health",
  "levels",
  "momentous",
  "thorne",
];

function voiceForProperty(property: string) {
  if (property === "store") {
    return "pain, truth, funny, real. Quiet proof. RUO only. Research-use framing is mandatory. Claims stay limited to purity, testing, logistics, education, and COA status. COA refs must be real Janoshik links or pendiente. No health, human-use, dosing, cosmetic, customer-results, or paid-ad targeting claims.";
  }

  if (property === "huh") {
    return "pain, truth, funny, real. Warm, anti-drill, Diego-adjacent, zero hype. Focus on the freeze before real Spanish conversations.";
  }

  return "pain, truth, funny, real. Specific, grounded, useful, zero hype.";
}

function buildSystemPrompt(property: string) {
  const quillSoul = fs.readFileSync(quillSoulPath, "utf8");
  const voiceLaws = `
Sam decision laws, highest priority:
1. Hook law: open by naming one specific human moment or fear the reader recognizes, such as "the freeze when someone replies off-script." Never open with a feature. Never open with a brand name.
2. Format law: prose rhythm only. No numbered steps, no "Step 1:", no listicle skeletons in post bodies. Same insight, written as flowing sentences.
3. Finished-content law: every draft body must be postable as-is. No shot lists, no briefs, no production notes in the queue body. If production context is useful, put it in production_note only.
4. Competitor law: rivals may appear at most once, only as setup, then they exit.
5. Specificity law for store/general: use concrete numbers, dates, named sources, and receipts inside the copy itself.
6. Dedup law: do not restate the same angle as another draft. Each draft needs a visibly different human moment, receipt, or mechanism.
`;
  const storeRules = property === "store" ? `
Store RUO drafting doctrine:
- Every store draft must explicitly frame the topic as research-use-only / RUO / not for human use.
- Allowed claims only: purity, testing, lot verification, logistics, education, COA status.
- COA references must be either a real Janoshik URL or the literal word "pendiente".
- Prefer concrete trust mechanics: lot lookup, visible COA workflow, storage/shipping clarity, compound education, email capture for docs.
- Never mention taking, injecting, dosing, cycles, stacks, symptoms, treatment, results, transformations, before/after, skin/hair/body outcomes, or paid-ad targeting.
- Store channels only: seo, email, x. Store kinds only: page for SEO article outlines, email for email-capture copy, post for educational X posts.
` : "";
  return `${voiceLaws}

${quillSoul}

Atlas Quill doctrine:
- Publishing is 100% manual. You draft only.
- Voice: ${voiceForProperty(property)}
- Drafts must feel written from source evidence, not from content templates.
${storeRules}
- Return JSON arrays only.`;
}

function buildUserPrompt(
  property: string,
  findings: FindingRow[],
  patterns: PatternRow[],
  tasteDecisions: TasteDecision[],
  gateFailureNotes: GateFailureNote[],
  maxDrafts: number,
) {
  const storeRules = property === "store" ? `
Store-specific output menu:
- Draft up to ${maxDrafts} total.
- Aim for at least 4 gate-passable store drafts when enough source material exists.
- Use only these channel/kind pairs:
  - seo + page: SEO article outline around compound education, COA/purity/testing, or lot verification.
  - email + email: email-capture copy offering RUO documentation, COA updates, or education.
  - x + post: educational X post about research-vendor trust mechanics.
- Include RUO / research-use-only / not for human use in each draft body.
- If you mention COA, include a real Janoshik URL from source evidence or write "COA: pendiente".
- Treat the gate-failure notes below as negative examples to avoid.
` : "";
  return `Draft content from these fresh Atlas findings.

Rules:
- Return a JSON array only.
- Max ${maxDrafts} drafts.
- Each draft object: kind, channel, title, hook, body, production_note, source_finding_ids, pattern_names.
- channel must be one of seo, email, tiktok, instagram, youtube, x, community, general.
- kind must be one of post, email, page.
- Keep each body under 90 words.
- Drafts must be human-gated and ready for Sam's queue.
- Store drafts must obey RUO-only framing.
- Huh drafts must not overpromise fluency or outcomes.
- Zero hype. Pain, truth, funny, real.
- The hook must name a specific human moment or fear before any product, brand, or feature.
- Bodies must be flowing prose. Do not write numbered steps, bullets, listicles, shot lists, or briefs.
- Bodies must be finished content Sam can post as-is. Put optional production context in production_note only.
- Competitor names can appear once at most, only as setup.
- Store/general drafts need concrete receipts in the copy: numbers, dates, source names, COA status, or named proof.
${storeRules}

Property: ${property}
Sam taste memory:
${JSON.stringify(tasteDecisions, null, 2)}

Recent store gate failures to avoid:
${JSON.stringify(gateFailureNotes, null, 2)}

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

async function todaysDraftTexts(property: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data, error } = await atlasDb()
    .from("actions")
    .select("payload")
    .eq("agent", "atlas-quill")
    .eq("property", property)
    .gte("created_at", start.toISOString())
    .limit(100);

  if (error) throw error;
  return (data ?? []).map((row) => draftComparableText((row.payload ?? {}) as Record<string, unknown>));
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

async function recentGateFailureNotes(property: string) {
  if (property !== "store") return [];

  const { data, error } = await atlasDb()
    .from("actions")
    .select("payload, compliance_notes")
    .eq("agent", "atlas-quill")
    .eq("property", "store")
    .eq("compliance_status", "failed")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  return (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      title: stringOrNull(payload.title),
      hook: stringOrNull(payload.hook),
      body: stringOrNull(payload.body),
      compliance_notes: row.compliance_notes ?? null,
    };
  });
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.slice(0, 320) : null;
}

function dailyDraftQuota(property: string) {
  if (property === "store") return 5;
  if (property === "huh") return 2;
  return 0;
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
  const existingTexts = await todaysDraftTexts(property);
  const acceptedTexts = [...existingTexts];
  let inserted = 0;

  for (const draft of drafts) {
    const text = `${draft.title}\n${draft.hook}\n${draft.body}`;
    const comparableText = draftComparableText(draft as unknown as Record<string, unknown>);
    const skipReason = draftSkipReason(draft, comparableText, acceptedTexts);
    if (skipReason) {
      console.log(`atlas-quill skipped ${property} draft "${draft.title}" (${skipReason}).`);
      continue;
    }

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
        production_note: draft.production_note ?? null,
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
    acceptedTexts.push(comparableText);
    inserted += 1;
  }

  return inserted;
}

function draftComparableText(payload: Record<string, unknown>) {
  return [payload.title, payload.hook, payload.body, payload.caption]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function draftSkipReason(draft: Draft, comparableText: string, existingTexts: string[]) {
  if (hasStepFormattedBody(draft.body)) return "step-formatted body";
  if (hasProductionBriefBody(draft.body)) return "production brief in body";
  if (competitorMentionCount(`${draft.title} ${draft.hook} ${draft.body}`) > 1) return "competitor appears more than once";
  if (existingTexts.some((existingText) => similarityScore(comparableText, existingText) >= 0.78)) return "near-duplicate same-day draft";
  return null;
}

function hasStepFormattedBody(body: string) {
  return /(^|\n)\s*(?:step\s*\d+|steps?:|\d+[.)]\s+|[-*]\s+)/i.test(body);
}

function hasProductionBriefBody(body: string) {
  return /\b(shot list|film this|record this|b-roll|voiceover|production note|creative brief|script notes?|camera angle)\b/i.test(body);
}

function competitorMentionCount(text: string) {
  const normalized = text.toLowerCase();
  return competitorNames.reduce((count, name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return count + (normalized.match(new RegExp(`\\b${escaped}\\b`, "g"))?.length ?? 0);
  }, 0);
}

function similarityScore(a: string, b: string) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return (2 * overlap) / (aTokens.size + bTokens.size);
}

function tokenSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3),
  );
}

export async function main() {
  const config = loadConfig();
  const quillConfig = jobConfig(config, "quill");
  const governor = new ModelGovernor(quillConfig, createProvider(quillConfig));
  let inserted = 0;

  for (const property of config.properties) {
    const quota = dailyDraftQuota(property);
    if (quota === 0) continue;
    const usedToday = await todaysActionCount(property);
    const remaining = Math.max(0, quota - usedToday);
    if (remaining === 0) continue;

    const findings = await recentFindings(property);
    if (findings.length === 0) continue;
    const patterns = await recentPatterns(property);
    const tasteDecisions = await recentTasteDecisions(property);
    const gateFailureNotes = await recentGateFailureNotes(property);
    const mix = tasteDecisions.reduce((counts, decision) => {
      counts[decision.role] = (counts[decision.role] ?? 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    console.log(`atlas-quill tuning: ${tasteDecisions.length} weighted decisions informed ${property}; mix=${JSON.stringify(mix)}.`);

    const response = await governor.complete("atlas-quill", {
      system: buildSystemPrompt(property),
      maxTokens: 4000,
      temperature: 0.4,
      messages: [{
        role: "user",
        content: buildUserPrompt(property, findings, patterns, tasteDecisions, gateFailureNotes, remaining),
      }],
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

    inserted += await insertDrafts(property, drafts, patterns);
  }

  console.log(`atlas-quill prepared ${inserted} drafts.`);
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof GovernorStop) {
      console.log(`atlas-quill stopped by governor: ${error.message}`);
      return;
    }

    console.error(error);
    process.exit(1);
  });
}
