import { jobConfig, loadConfig } from "../lib/config.js";
import { atlasDb } from "../lib/db.js";
import { loadScoutDoctrine } from "../lib/doctrine.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { processIntakeRows } from "../lib/intake.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";
import { fetchSnapshot } from "../lib/sources.js";

type FindingDraft = {
  property: string;
  claim: string;
  evidence: string;
  source_url: string;
  confidence: number;
  tags: string[];
};

function buildSystemPrompt() {
  return `${loadScoutDoctrine()}

You are running as Atlas Scout, a read-only research worker.
Never post, message, buy, log in, or mutate the outside world.
Return only compact JSON arrays.`;
}

function buildUserPrompt(input: unknown) {
  return `Analyze these read-only source snapshots for buyer-producing marketing findings.

Rules:
- Return a JSON array only.
- Max 3 findings for this target.
- Each object must include: property, claim, evidence, source_url, confidence, tags.
- property must exactly equal "${(input as { target?: { property?: string } }).target?.property ?? "general"}".
- confidence must be 0-1.
- Prefer specific claims tied to source evidence.
- Reject fluff.

Input:
${JSON.stringify(input, null, 2)}`;
}

async function insertFindings(findings: FindingDraft[]) {
  if (findings.length === 0) return;

  const { error } = await atlasDb().from("findings").insert(
    findings.map((finding) => ({
      agent: "atlas-scout",
      property: finding.property,
      claim: finding.claim,
      evidence: finding.evidence,
      source_url: finding.source_url,
      confidence: finding.confidence,
      tags: finding.tags,
    })),
  );

  if (error) throw error;
}

export async function main() {
  const config = loadConfig();
  const scoutConfig = jobConfig(config, "scout");
  const governor = new ModelGovernor(scoutConfig, createProvider(scoutConfig));
  const system = buildSystemPrompt();
  const allFindings: FindingDraft[] = [];
  const intakeCount = await processIntakeRows(
    governor,
    scoutConfig,
    system,
    scoutConfig.max_findings_per_run,
  );

  for (const target of config.research_targets) {
    if (allFindings.length + intakeCount >= scoutConfig.max_findings_per_run) break;

    const snapshots = await Promise.all(target.urls.map((url) => fetchSnapshot(url)));
    const response = await governor.complete("atlas-scout", {
      system,
      maxTokens: 1500,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: buildUserPrompt({ target, snapshots }),
        },
      ],
    });

    const parsed = parseJsonArray<FindingDraft>(response.text)
      .filter((finding) => finding.claim && finding.evidence && finding.source_url)
      .map((finding) => ({
        ...finding,
        property: target.property,
        tags: Array.from(new Set([...(target.tags ?? []), ...(finding.tags ?? []), "scout"])),
        confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.5))),
      }));

    allFindings.push(...parsed);
  }

  const capped = allFindings.slice(0, scoutConfig.max_findings_per_run - intakeCount);
  await insertFindings(capped);
  console.log(`atlas-scout prepared ${intakeCount + capped.length} findings.`);
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-scout stopped by governor: ${error.message}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
