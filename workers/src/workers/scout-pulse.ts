import { jobConfig, loadConfig, type ResearchTarget } from "../lib/config.js";
import { normalizeChannel } from "../lib/channel.js";
import { atlasDb } from "../lib/db.js";
import { loadScoutDoctrine } from "../lib/doctrine.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";

type PulseFinding = {
  property: string;
  claim: string;
  evidence: string;
  source_url: string;
  confidence: number;
  tags: string[];
  channel?: string;
};

function buildSystemPrompt() {
  return `${loadScoutDoctrine()}

You are Atlas Scout Pulse, the live discussion and trend lane.
You may use configured xAI search tools, but you must remain read-only.
Never post, message, buy, log in, or mutate the outside world.
Return only compact JSON arrays.`;
}

function buildUserPrompt(targets: ResearchTarget[], maxFindings: number) {
  return `Find current live discussion and trend signals on X relevant to these Atlas targets.

Rules:
- Return a JSON array only.
- Max ${maxFindings} findings total.
- Each object must include: property, claim, evidence, source_url, confidence, tags.
- Include channel. Pulse defaults to "x" unless the finding is clearly about another channel.
- property must be a configured slug such as store, huh, restaurant, general, or another Atlas property.
- Use property "huh" for language-app marketing. Use property "general" for peptide-adjacent DTC and channel tactics.
- evidence should name the live discussion pattern and cite enough context to audit the claim.
- source_url should be a cited X/search URL when available, otherwise the most relevant public source URL.
- Every tag array must include "pulse".
- Prefer buyer-producing trends, creator formats, hooks, objections, and cheap tests Sam can run within seven days.
- Reject generic trend summaries.

Targets:
${JSON.stringify(targets, null, 2)}`;
}

function normalizeProperty(finding: PulseFinding) {
  const slug = slugify(finding.property);
  if (slug) return slug;

  if (finding.tags?.some((tag) => tag.includes("huh") || tag.includes("language"))) {
    return "huh";
  }

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

async function insertPulseFindings(findings: PulseFinding[]) {
  if (findings.length === 0) return;

  const rows = findings.map((finding) => ({
      agent: "atlas-scout-pulse",
      property: normalizeProperty(finding),
      channel: normalizeChannel(finding.channel ?? "x"),
      claim: finding.claim,
      evidence: finding.evidence,
      source_url: finding.source_url,
      confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.5))),
      tags: Array.from(new Set([...(finding.tags ?? []), "pulse"])),
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

function isMissingChannelError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("channel"));
}

export async function main() {
  const config = loadConfig();
  const pulseConfig = jobConfig(config, "scout-pulse");
  const governor = new ModelGovernor(pulseConfig, createProvider(pulseConfig));

  const response = await governor.complete("atlas-scout-pulse", {
    system: buildSystemPrompt(),
    maxTokens: 1800,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(config.research_targets, pulseConfig.max_findings_per_run),
      },
    ],
  });

  const findings = parseJsonArray<PulseFinding>(response.text)
    .filter((finding) => finding.claim && finding.evidence && finding.source_url)
    .slice(0, pulseConfig.max_findings_per_run);

  await insertPulseFindings(findings);
  console.log(`atlas-scout-pulse prepared ${findings.length} findings.`);
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-scout-pulse stopped by governor: ${error.message}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
