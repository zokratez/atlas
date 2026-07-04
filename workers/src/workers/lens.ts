import { loadConfig } from "../lib/config.js";
import { atlasDb } from "../lib/db.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";

type FindingRow = {
  id: string;
  created_at: string;
  property: string;
  claim: string;
  evidence: string | null;
  source_url: string | null;
  confidence: number | null;
  tags: string[] | null;
};

type LensFinding = {
  property: string;
  claim: string;
  evidence: string;
  source_url: string;
  confidence: number;
  tags: string[];
};

async function recentScoutFindings() {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("id, created_at, property, claim, evidence, source_url, confidence, tags")
    .contains("tags", ["scout"])
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw error;
  return (data ?? []) as FindingRow[];
}

function buildUserPrompt(findings: FindingRow[]) {
  return `You are Atlas Lens. Read recent Scout findings and produce analytical summary findings.

Return a JSON array only.
Max 5 summary findings.
Each object must include: property, claim, evidence, source_url, confidence, tags.
Every tag array must include "lens".
Focus on patterns, contradictions, cheap tests, and what Sam should learn.

Recent findings:
${JSON.stringify(findings, null, 2)}`;
}

async function insertLensFindings(findings: LensFinding[]) {
  if (findings.length === 0) return;

  const { error } = await atlasDb().from("findings").insert(
    findings.map((finding) => ({
      agent: "atlas-lens",
      property: finding.property,
      claim: finding.claim,
      evidence: finding.evidence,
      source_url: finding.source_url,
      confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.5))),
      tags: Array.from(new Set([...(finding.tags ?? []), "lens"])),
    })),
  );

  if (error) throw error;
}

export async function main() {
  const config = loadConfig();
  const findings = await recentScoutFindings();

  if (findings.length === 0) {
    console.log("atlas-lens found no scout findings to summarize.");
    return;
  }

  const governor = new ModelGovernor(config, createProvider(config));
  const response = await governor.complete("atlas-lens", {
    system:
      "You are Atlas Lens, the analytical pass over Scout findings. Return only JSON arrays.",
    maxTokens: 1200,
    temperature: 0.1,
    messages: [{ role: "user", content: buildUserPrompt(findings) }],
  });

  const summaries = parseJsonArray<LensFinding>(response.text).slice(0, 5);
  await insertLensFindings(summaries);
  console.log(`atlas-lens prepared ${summaries.length} summary findings.`);
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-lens stopped by governor: ${error.message}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
