import { jobConfig, loadConfig } from "../lib/config.js";
import { atlasDb } from "../lib/db.js";
import { GovernorStop, ModelGovernor } from "../lib/governor.js";
import { parseJsonArray } from "../lib/json.js";
import { createProvider } from "../lib/provider.js";
import { runComplianceGate } from "../lib/compliance.js";
import { normalizeChannel } from "../lib/channel.js";

type ActionRow = {
  id: string;
  property: string;
  kind: string;
  channel: string | null;
  payload: Record<string, unknown>;
  compliance_status: string;
  status: string;
};

type PatternRow = {
  id: string;
  property: string;
  channel: string;
  name: string;
  description: string | null;
  support_count: number;
  confidence: number | null;
  status: string;
};

type RenditionDraft = {
  channel: string;
  title: string;
  final_text: string;
  format_note?: string;
  scheduled_for?: string | null;
  pattern_ids?: string[];
};

const defaultChannels = ["instagram", "tiktok", "x"];
const storeChannels = ["seo", "email", "x"];

function producerPrompt(action: ActionRow, patterns: PatternRow[]) {
  const channels = intendedChannels(action);
  return `Adapt this approved Atlas action into per-channel renditions.

Return a JSON array only. Make one rendition for each channel: ${channels.join(", ")}.

Each object:
- channel
- title
- final_text
- format_note
- scheduled_for (ISO string if a clear recommendation exists, otherwise null)
- pattern_ids

Channel formats:
- tiktok: short script with hook in first 2 seconds.
- instagram: caption with hook, body, and simple CTA.
- x: short post or thread draft.
- seo: SEO article outline or section block with H2s and body.
- email: email-capture block with subject and body.

Rules:
- Shape each rendition by validated/emerging patterns for that channel.
- Store property must stay RUO only and may produce only: seo_article, email_block, x_post. Use channels seo, email, x only. No Instagram or TikTok for store.
- Store COA refs must be real Janoshik links or "pendiente"; claims stay limited to purity/testing/logistics/education.
- Huh property must focus on Spanish conversation freeze, not fluency promises.
- No API posting. Text only.

Action:
${JSON.stringify(action, null, 2)}

Pattern ledger:
${JSON.stringify(patterns, null, 2)}`;
}

async function approvedActions() {
  const { data, error } = await atlasDb()
    .from("actions")
    .select("id, property, kind, channel, payload, compliance_status, status")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return ((data ?? []) as ActionRow[]).filter((action) => {
    const payload = action.payload ?? {};
    if (Array.isArray(payload.renditions) && payload.renditions.length > 0) return false;
    return action.compliance_status !== "failed";
  });
}

async function patternsFor(action: ActionRow) {
  const { data, error } = await atlasDb()
    .from("patterns")
    .select("id, property, channel, name, description, support_count, confidence, status")
    .eq("property", action.property)
    .neq("status", "busted")
    .order("support_count", { ascending: false })
    .limit(30);

  if (isMissingPatternsError(error)) return [];
  if (error) throw error;
  return data as PatternRow[];
}

export async function main() {
  const config = loadConfig();
  const producerConfig = jobConfig(config, "producer");
  const governor = new ModelGovernor(producerConfig, createProvider(producerConfig));
  const actions = await approvedActions();

  let produced = 0;
  for (const action of actions.slice(0, 8)) {
    const patterns = await patternsFor(action);
    const response = await governor.complete("atlas-producer", {
      system: "You are Atlas Producer. Adapt approved drafts into manual-posting renditions. Return JSON arrays only.",
      maxTokens: 2200,
      temperature: 0.2,
      messages: [{ role: "user", content: producerPrompt(action, patterns) }],
    });

    const parsed = parseJsonArray<RenditionDraft>(response.text).filter((rendition) => rendition.channel && rendition.final_text);
    const renditions = parsed.slice(0, 5).map((rendition) => {
      const channel = normalizeChannel(rendition.channel);
      const compliance = runComplianceGate(action.property, rendition.final_text);
      return {
        channel,
        title: rendition.title || `${channel} rendition`,
        final_text: rendition.final_text,
        format_note: rendition.format_note ?? null,
        scheduled_for: rendition.scheduled_for ?? recommendedWindow(channel),
        pattern_ids: Array.isArray(rendition.pattern_ids) ? rendition.pattern_ids : [],
        compliance_status: action.property === "store" ? compliance.status : "passed",
        compliance_notes: action.property === "store" ? compliance.notes : null,
      };
    }).filter((rendition) => {
      if (action.property !== "store") return true;
      return storeChannels.includes(rendition.channel);
    });

    const passed = renditions.filter((rendition) => rendition.compliance_status !== "failed");
    if (passed.length === 0) continue;

    const payload = {
      ...(action.payload ?? {}),
      renditions: passed,
      producer_note: `Generated ${passed.length} renditions from ${patterns.length} patterns.`,
    };
    const firstScheduled = passed.find((rendition) => rendition.scheduled_for)?.scheduled_for ?? null;
    const { error } = await atlasDb()
      .from("actions")
      .update({
        payload,
        scheduled_for: firstScheduled,
      })
      .eq("id", action.id);

    if (error) throw error;
    produced += 1;
  }

  console.log(`atlas-producer generated renditions for ${produced} actions.`);
}

function intendedChannels(action: ActionRow) {
  if (action.property === "store") return storeChannels;

  const payloadChannels = action.payload?.intended_channels;
  if (Array.isArray(payloadChannels)) {
    const channels = payloadChannels.map((channel) => normalizeChannel(String(channel))).filter((channel) => channel !== "general");
    if (channels.length > 0) return Array.from(new Set(channels)).slice(0, 5);
  }
  const channel = normalizeChannel(action.channel);
  if (channel !== "general") return Array.from(new Set([channel, ...defaultChannels])).slice(0, 3);
  return defaultChannels;
}

function recommendedWindow(channel: string) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(channel === "email" ? 9 : 19, 0, 0, 0);
  return date.toISOString();
}

function isMissingPatternsError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("patterns"));
}

main().catch((error: unknown) => {
  if (error instanceof GovernorStop) {
    console.log(`atlas-producer stopped by governor: ${error.message}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
