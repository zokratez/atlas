import fs from "node:fs";
import { jobConfig, loadConfig } from "../lib/config.js";
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

function buildUserPrompt(property: string, findings: FindingRow[], maxDrafts: number) {
  return `Draft content from these fresh Atlas findings.

Rules:
- Return a JSON array only.
- Max ${maxDrafts} drafts.
- Each draft object: kind, channel, title, hook, body, source_finding_ids, pattern_names.
- kind must be one of post, email, page.
- Keep each body under 90 words.
- Drafts must be human-gated and ready for Sam's queue.
- Store drafts must obey RUO-only framing.
- Huh drafts must not overpromise fluency or outcomes.
- Zero hype. Pain, truth, funny, real.

Property: ${property}
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

function patternScore(draft: Draft, findings: FindingRow[]) {
  const text = `${draft.title} ${draft.hook} ${draft.body}`.toLowerCase();
  const patterns = new Set<string>();

  for (const finding of findings) {
    for (const tag of finding.tags ?? []) {
      const normalized = tag.replace(/^buyer-mechanism[:-]?/i, "").replace(/-/g, " ");
      if (normalized.length > 3 && text.includes(normalized.toLowerCase().split(" ")[0])) {
        patterns.add(tag);
      }
    }

    for (const phrase of ["proof", "testing", "COA", "conversation", "freeze", "trust", "hook", "personalization", "transcript", "photo"]) {
      if (text.includes(phrase.toLowerCase()) && `${finding.claim} ${finding.evidence ?? ""}`.toLowerCase().includes(phrase.toLowerCase())) {
        patterns.add(phrase);
      }
    }
  }

  for (const pattern of draft.pattern_names ?? []) patterns.add(pattern);

  const names = Array.from(patterns).slice(0, 6);
  return {
    count: names.length,
    names,
    label: `matches ${names.length} proven patterns: ${names.length > 0 ? names.join(", ") : "none yet"}`,
    caveat: "prior, not prediction",
  };
}

async function insertDrafts(property: string, drafts: Draft[], findings: FindingRow[]) {
  for (const draft of drafts) {
    const text = `${draft.title}\n${draft.hook}\n${draft.body}`;
    const compliance = runComplianceGate(property, text);
    const score = patternScore(draft, findings);

    const { error } = await atlasDb().from("actions").insert({
      agent: "atlas-quill",
      property,
      kind: draft.kind,
      channel: draft.channel,
      payload: {
        title: draft.title,
        hook: draft.hook,
        body: draft.body,
        source_finding_ids: draft.source_finding_ids ?? [],
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

    const response = await governor.complete("atlas-quill", {
      system: buildSystemPrompt(property),
      maxTokens: 4000,
      temperature: 0.4,
      messages: [{ role: "user", content: buildUserPrompt(property, findings, remaining) }],
    });

    const drafts = parseJsonArray<Draft>(response.text)
      .filter((draft) => ["post", "email", "page"].includes(draft.kind) && draft.title && draft.body)
      .slice(0, remaining);

    await insertDrafts(property, drafts, findings);
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
