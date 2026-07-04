import { atlasDb } from "../lib/db.js";

type IgMedia = {
  id: string;
  caption?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  insights?: {
    data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
  };
};

async function main() {
  await assertEngineEnabled();
  const token = process.env.IG_GRAPH_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (!token || !userId) {
    console.log("atlas-ig-puller skipping: IG_GRAPH_ACCESS_TOKEN or IG_USER_ID missing.");
    return;
  }

  await checkTokenExpiry();
  const media = await listMedia(userId, token);
  let inserted = 0;
  for (const item of media.slice(0, 25)) {
    const actionId = await matchOrCreateAction(item);
    const rows = resultRows(item, actionId);
    if (rows.length === 0) continue;
    const { error } = await atlasDb().from("results").insert(rows);
    if (error) {
      await logFailure(`insert failed for ${item.id}: ${error.message}`);
      continue;
    }
    inserted += rows.length;
  }

  console.log(`atlas-ig-puller inserted ${inserted} instagram result rows.`);
}

async function listMedia(userId: string, token: string) {
  const fields = [
    "id",
    "caption",
    "timestamp",
    "permalink",
    "media_type",
    "like_count",
    "comments_count",
    "insights.metric(reach,views,saved,profile_visits)",
  ].join(",");
  const response = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(userId)}/media?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(`IG media ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { data?: IgMedia[] };
  return payload.data ?? [];
}

async function matchOrCreateAction(media: IgMedia) {
  const caption = media.caption ?? "";
  const timestamp = media.timestamp ? new Date(media.timestamp) : new Date();
  const start = new Date(timestamp);
  start.setHours(start.getHours() - 36);
  const end = new Date(timestamp);
  end.setHours(end.getHours() + 36);

  const { data, error } = await atlasDb()
    .from("actions")
    .select("id, payload, decided_at")
    .eq("property", "huh")
    .eq("channel", "instagram")
    .eq("status", "published")
    .gte("decided_at", start.toISOString())
    .lte("decided_at", end.toISOString())
    .limit(20);

  if (error) throw error;
  const normalizedCaption = normalizeText(caption);
  const matched = (data ?? []).find((action) => {
    const payload = action.payload as { caption?: string; body?: string; title?: string } | null;
    const actionText = normalizeText(`${payload?.caption ?? ""} ${payload?.body ?? ""} ${payload?.title ?? ""}`);
    return actionText && normalizedCaption && (actionText.includes(normalizedCaption.slice(0, 40)) || normalizedCaption.includes(actionText.slice(0, 40)));
  });
  if (matched) return matched.id;

  const { data: created, error: createError } = await atlasDb()
    .from("actions")
    .insert({
      agent: "ig-import",
      property: "huh",
      kind: "post",
      channel: "instagram",
      payload: {
        title: caption.slice(0, 96) || "Imported Instagram post",
        caption,
        body: caption,
        permalink: media.permalink ?? null,
        instagram_media_id: media.id,
        imported_at: new Date().toISOString(),
      },
      compliance_status: "passed",
      compliance_notes: "Imported own Instagram post; publishing already happened manually.",
      status: "published",
      decided_at: timestamp.toISOString(),
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id as string;
}

function resultRows(media: IgMedia, actionId: string) {
  const date = media.timestamp ? new Date(media.timestamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const metrics = new Map<string, number>();
  if (Number.isFinite(Number(media.like_count))) metrics.set("likes", Number(media.like_count));
  if (Number.isFinite(Number(media.comments_count))) metrics.set("comments", Number(media.comments_count));
  for (const insight of media.insights?.data ?? []) {
    const value = Number(insight.values?.[0]?.value ?? 0);
    if (Number.isFinite(value)) metrics.set(insight.name, value);
  }

  return Array.from(metrics.entries()).map(([metric, value]) => ({
    property: "huh",
    channel: "instagram",
    source: "instagram",
    metric,
    value,
    period_start: date,
    period_end: date,
    raw: {
      action_id: actionId,
      instagram_media_id: media.id,
      permalink: media.permalink ?? null,
      timestamp: media.timestamp ?? null,
    },
  }));
}

async function checkTokenExpiry() {
  const expiresAt = process.env.IG_TOKEN_EXPIRES_AT;
  if (!expiresAt) return;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return;
  const days = (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (days > 7) return;

  await atlasDb().from("findings").insert({
    agent: "atlas-ig-puller",
    property: "general",
    channel: "instagram",
    claim: "IG token renewal due",
    evidence: `Instagram token expires ${expiry.toISOString()}. Renew before the puller goes quiet.`,
    source_url: null,
    confidence: 0.9,
    tags: ["instagram", "token", "renewal"],
    pinned: true,
  });
}

async function assertEngineEnabled() {
  const { data, error } = await atlasDb().from("flags").select("value").eq("key", "engine_enabled").single();
  if (error) throw error;
  if (data.value !== true) throw new Error("engine disabled; instagram puller skipped.");
}

async function logFailure(message: string) {
  console.error(`atlas-ig-puller ${message}`);
  await atlasDb().from("findings").insert({
    agent: "atlas-ig-puller",
    property: "general",
    channel: "instagram",
    claim: "Instagram results pull failed",
    evidence: message.slice(0, 1000),
    source_url: null,
    confidence: 0.7,
    tags: ["instagram", "results", "failure"],
  });
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

main().catch(async (error: unknown) => {
  await logFailure(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
