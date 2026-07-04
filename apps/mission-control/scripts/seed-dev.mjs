import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}).schema("atlas");

const now = new Date().toISOString();

const findings = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    created_at: now,
    agent: "dev-seed",
    property: "huh",
    claim: "Spanish learners engage with freeze-frame hooks when the first line names a real conversation fear.",
    evidence: "Seeded for Mission Control UI validation before scout/lens workers exist.",
    source_url: "https://example.com/atlas-seed/freeze-hook",
    confidence: 0.72,
    tags: ["dev_seed", "huh", "hook"],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    created_at: now,
    agent: "dev-seed",
    property: "huh",
    claim: "Short Diego screen recordings should show the correction before the emotional payoff.",
    evidence: "Seeded to test feed cards and confidence chips.",
    source_url: "https://example.com/atlas-seed/diego-demo",
    confidence: 0.67,
    tags: ["dev_seed", "diego", "shorts"],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    created_at: now,
    agent: "dev-seed",
    property: "general",
    claim: "Queue approvals need compliance notes visible before any publish action.",
    evidence: "Seeded to validate the governance surface.",
    source_url: "https://example.com/atlas-seed/governance",
    confidence: 0.81,
    tags: ["dev_seed", "compliance", "queue"],
  },
];

const actions = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    created_at: now,
    agent: "dev-seed",
    property: "huh",
    kind: "post",
    channel: "tiktok",
    payload: {
      title: "TikTok: I freeze when the waiter asks anything",
      hook: "I hate that I know Spanish words but freeze when the waiter asks anything.",
      body: "Faceless Diego screen recording. User asks for a coffee order. Diego corrects gently. End on App Store frame.",
    },
    compliance_status: "passed",
    compliance_notes: "No health, finance, or guaranteed growth claims. App shown clearly.",
    status: "pending",
    decided_at: null,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    created_at: now,
    agent: "dev-seed",
    property: "huh",
    kind: "post",
    channel: "instagram",
    payload: {
      title: "Reel: practice the conversation you avoid",
      hook: "Practice the Spanish conversation you are scared to have.",
      body: "Native re-export, no watermark. Family/emotional angle for iOS-native install intent.",
    },
    compliance_status: "unchecked",
    compliance_notes: "Needs final Grader pass before publishing.",
    status: "pending",
    decided_at: null,
  },
];

for (const [table, rows] of [
  ["findings", findings],
  ["actions", actions],
]) {
  const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    console.error(`${table} seed failed: ${error.message}`);
    process.exit(1);
  }
}

console.log("Seeded 3 fake findings and 2 fake pending actions in atlas schema.");
