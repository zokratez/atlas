import crypto from "node:crypto";
import { atlasDb } from "../lib/db.js";

type ResultRow = {
  property: string;
  channel: string;
  source: "gsc" | "revenuecat";
  metric: string;
  value: number;
  period_start: string;
  period_end: string;
  raw: Record<string, unknown>;
};

async function main() {
  await assertEngineEnabled();
  const rows = [
    ...(await pullGsc().catch(async (error) => {
      await logFailure("gsc", error);
      return [];
    })),
    ...(await pullRevenueCat().catch(async (error) => {
      await logFailure("revenuecat", error);
      return [];
    })),
  ];

  if (rows.length > 0) {
    const { error } = await atlasDb().from("results").insert(rows);
    if (error) throw error;
  }

  console.log(`atlas-results-autopilot inserted ${rows.length} result rows.`);
}

async function pullGsc(): Promise<ResultRow[]> {
  const siteUrl = process.env.GSC_SITE_URL;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!siteUrl || !clientEmail || !privateKey) {
    console.log("atlas-results-autopilot skipping GSC: missing env.");
    return [];
  }

  const token = await googleAccessToken(clientEmail, privateKey, "https://www.googleapis.com/auth/webmasters.readonly");
  const { start, end } = yesterdayWindow();
  const response = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: start,
      endDate: end,
      dimensions: ["query"],
      rowLimit: 25,
    }),
  });

  if (!response.ok) throw new Error(`GSC ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> };
  return (payload.rows ?? []).flatMap((row) => [
    result("gsc", "clicks", row.clicks ?? 0, start, end, { query: row.keys?.[0] ?? null, row }),
    result("gsc", "impressions", row.impressions ?? 0, start, end, { query: row.keys?.[0] ?? null, row }),
  ]);
}

async function pullRevenueCat(): Promise<ResultRow[]> {
  const apiKey = process.env.REVENUECAT_API_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!apiKey || !projectId) {
    console.log("atlas-results-autopilot skipping RevenueCat: missing env.");
    return [];
  }

  const { start, end } = yesterdayWindow();
  const response = await fetch(`https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/metrics/overview?start_date=${start}&end_date=${end}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) throw new Error(`RevenueCat ${response.status}: ${await response.text()}`);
  const payload = await response.json() as Record<string, unknown>;
  const metrics = flattenNumericMetrics(payload, ["installs", "trials", "subscriptions", "active_subscriptions", "revenue"]);
  return metrics.map(([metric, value]) => ({
    property: "huh",
    channel: "general",
    source: "revenuecat",
    metric,
    value,
    period_start: start,
    period_end: end,
    raw: { project_id: projectId, payload },
  }));
}

function result(source: "gsc", metric: string, value: number, start: string, end: string, raw: Record<string, unknown>): ResultRow {
  return {
    property: "store",
    channel: "seo",
    source,
    metric,
    value,
    period_start: start,
    period_end: end,
    raw,
  };
}

async function googleAccessToken(clientEmail: string, privateKey: string, scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(privateKey, "base64url");
  const assertion = `${header}.${claim}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google token ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google token response missing access_token.");
  return payload.access_token;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function yesterdayWindow() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  const day = date.toISOString().slice(0, 10);
  return { start: day, end: day };
}

function flattenNumericMetrics(payload: Record<string, unknown>, names: string[]) {
  const rows: Array<[string, number]> = [];
  const text = JSON.stringify(payload);
  for (const name of names) {
    const match = text.match(new RegExp(`"${name}"\\s*:\\s*([0-9.]+)`, "i"));
    if (match) rows.push([name, Number(match[1])]);
  }
  return rows;
}

async function assertEngineEnabled() {
  const { data, error } = await atlasDb().from("flags").select("value").eq("key", "engine_enabled").single();
  if (error) throw error;
  if (data.value !== true) throw new Error("engine disabled; results autopilot skipped.");
}

async function logFailure(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`atlas-results-autopilot ${source} failed: ${message}`);
  await atlasDb().from("findings").insert({
    agent: "atlas-results-autopilot",
    property: "general",
    channel: "general",
    claim: `${source} results pull failed`,
    evidence: message.slice(0, 1000),
    source_url: null,
    confidence: 0.7,
    tags: ["results", source, "failure"],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
