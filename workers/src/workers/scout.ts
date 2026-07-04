import { jobConfig, loadConfig } from "../lib/config.js";
import { inferChannel, normalizeChannel } from "../lib/channel.js";
import { atlasDb } from "../lib/db.js";
import { loadScoutDoctrine } from "../lib/doctrine.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { processIntakeRows } from "../lib/intake.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";
import { fetchSnapshot } from "../lib/sources.js";
import { isDirectRun } from "../lib/env.js";

type FindingDraft = {
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
- Include channel as one of: seo, email, tiktok, instagram, youtube, x, community, general.
- property must exactly equal "${(input as { target?: { property?: string } }).target?.property ?? "general"}".
- confidence must be 0-1.
- Prefer specific claims tied to source evidence.
- Reject fluff.

Input:
${JSON.stringify(input, null, 2)}`;
}

async function insertFindings(findings: FindingDraft[]) {
  if (findings.length === 0) return;

  const rows = findings.map((finding) => ({
      agent: "atlas-scout",
      property: finding.property,
      claim: finding.claim,
      evidence: finding.evidence,
      source_url: finding.source_url,
      channel: normalizeChannel(finding.channel),
      confidence: finding.confidence,
      tags: finding.tags,
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

export async function runScout(options: { intakeOnly?: boolean; publicDemoOnly?: boolean } = {}) {
  const config = loadConfig();
  const scoutConfig = jobConfig(config, "scout");
  const pulseConfig = jobConfig(config, "scout-pulse");
  const governor = new ModelGovernor(scoutConfig, createProvider(scoutConfig));
  const pulseGovernor = new ModelGovernor(pulseConfig, createProvider(pulseConfig));
  const system = buildSystemPrompt();
  const allFindings: FindingDraft[] = [];
  const intakeCount = await processIntakeRows(
    governor,
    pulseGovernor,
    scoutConfig,
    system,
    scoutConfig.max_findings_per_run,
    { publicDemoOnly: options.publicDemoOnly },
  );

  if (options.intakeOnly) {
    console.log(`atlas-scout prepared ${intakeCount} intake findings.`);
    return;
  }

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
        channel: inferChannel({
          channel: finding.channel,
          tags: [...(target.tags ?? []), ...(finding.tags ?? [])],
          sourceUrl: finding.source_url,
          text: `${finding.claim} ${finding.evidence}`,
        }),
        tags: Array.from(new Set([...(target.tags ?? []), ...(finding.tags ?? []), "scout"])),
        confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.5))),
      }));

    allFindings.push(...parsed);
  }

  const capped = allFindings.slice(0, scoutConfig.max_findings_per_run - intakeCount);
  await insertFindings(capped);
  console.log(`atlas-scout prepared ${intakeCount + capped.length} findings.`);
}

export async function main() {
  await runScout();
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof GovernorStop) {
      console.log(`atlas-scout stopped by governor: ${error.message}`);
      return;
    }
    console.error(error);
    process.exit(1);
  });
}
