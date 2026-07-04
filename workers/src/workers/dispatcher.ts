import { atlasDb } from "../lib/db.js";
import { GovernorStop } from "../lib/governor.js";
import { main as runLens } from "./lens.js";
import { main as runQuill } from "./quill.js";
import { main as runScout, runScout as runScoutMode } from "./scout.js";

type RunWorker = "scout" | "lens" | "quill";

type RunRequest = {
  requested_at?: string;
  operator_email?: string;
};

const intervalMs = 60_000;
const runOrder: RunWorker[] = ["scout", "lens", "quill"];

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await processPublicDemos();
    for (const worker of runOrder) {
      const request = await takeRequest(worker);
      if (!request) continue;
      await runManual(worker, request);
    }
  } finally {
    running = false;
  }
}

async function processPublicDemos() {
  const due = await publicDemoDueCount();
  if (due === 0) return;
  if (!(await publicDemoCanSpend())) {
    await writeReceipt({
      worker: "scout",
      status: "stopped",
      produced: 0,
      costUsd: 0,
      operatorEmail: "public-demo",
      note: "public_demo_daily_cost_cap_usd reached.",
    });
    return;
  }

  const startedAt = new Date().toISOString();
  const before = await snapshot("scout");
  let status = "complete";
  let note = "";
  try {
    await runScoutMode({ intakeOnly: true, publicDemoOnly: true });
  } catch (error) {
    if (error instanceof GovernorStop) {
      status = "stopped";
      note = error.message;
    } else {
      status = "failed";
      note = error instanceof Error ? error.message : String(error);
    }
  }

  const after = await snapshot("scout", startedAt);
  await writeReceipt({
    worker: "scout",
    status,
    produced: Math.max(0, after.outputs - before.outputs),
    costUsd: Math.max(0, after.usd - before.usd),
    operatorEmail: "public-demo",
    note: note || `processed ${due} queued public demo intake rows.`,
  });
}

async function takeRequest(worker: RunWorker): Promise<RunRequest | null> {
  const key = flagKey(worker);
  const { data, error } = await atlasDb()
    .from("flags")
    .select("value")
    .eq("key", key)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  if (!data.value || data.value === false || typeof data.value !== "object") return null;
  const request = data.value as RunRequest;

  const { error: clearError } = await atlasDb()
    .from("flags")
    .update({ value: false, updated_at: new Date().toISOString() })
    .eq("key", key);

  if (clearError) throw clearError;
  return request;
}

async function runManual(worker: RunWorker, request: RunRequest) {
  const startedAt = new Date().toISOString();
  const before = await snapshot(worker);
  let status = "complete";
  let note = "";

  try {
    await runner(worker)();
  } catch (error) {
    if (error instanceof GovernorStop) {
      status = "stopped";
      note = error.message;
    } else {
      status = "failed";
      note = error instanceof Error ? error.message : String(error);
    }
  }

  const after = await snapshot(worker, startedAt);
  const produced = Math.max(0, after.outputs - before.outputs);
  const costUsd = Math.max(0, after.usd - before.usd);
  await writeReceipt({
    worker,
    status,
    produced,
    costUsd,
    operatorEmail: request.operator_email ?? "unknown",
    note,
  });
}

function runner(worker: RunWorker) {
  if (worker === "scout") return runScout;
  if (worker === "lens") return runLens;
  return runQuill;
}

async function snapshot(worker: RunWorker, since?: string) {
  const outputQuery = outputCountQuery(worker, since);
  const costQuery = atlasDb()
    .from("costs")
    .select("usd")
    .in("agent", costAgents(worker));

  if (since) costQuery.gte("created_at", since);

  const [outputResult, costResult] = await Promise.all([outputQuery, costQuery]);
  if (outputResult.error) throw outputResult.error;
  if (costResult.error) throw costResult.error;

  return {
    outputs: outputResult.count ?? 0,
    usd: (costResult.data ?? []).reduce((sum, row) => sum + Number(row.usd ?? 0), 0),
  };
}

function outputCountQuery(worker: RunWorker, since?: string) {
  if (worker === "quill") {
    const query = atlasDb()
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("agent", "atlas-quill");
    if (since) query.gte("created_at", since);
    return query;
  }

  const query = atlasDb()
    .from("findings")
    .select("id", { count: "exact", head: true });
  if (worker === "scout") query.in("agent", ["atlas-scout", "atlas-scout-pulse"]);
  if (worker === "lens") query.like("agent", "atlas-lens%");
  if (since) query.gte("created_at", since);
  return query;
}

function costAgents(worker: RunWorker) {
  if (worker === "scout") return ["atlas-scout", "atlas-scout-pulse"];
  if (worker === "lens") return ["atlas-lens", "atlas-lens-weekly", "atlas-lens-monthly", "atlas-lens-quarterly"];
  return ["atlas-quill"];
}

async function publicDemoDueCount() {
  const { count, error } = await atlasDb()
    .from("intake")
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .contains("tags", ["public_demo"]);

  if (error?.code === "42703") return 0;
  if (error) throw error;
  return count ?? 0;
}

async function publicDemoCanSpend() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [flagResult, costResult] = await Promise.all([
    atlasDb().from("flags").select("value").eq("key", "public_demo_daily_cost_cap_usd").single(),
    atlasDb().from("costs").select("usd").in("agent", costAgents("scout")).gte("created_at", start.toISOString()),
  ]);

  if (flagResult.error?.code === "PGRST116") return true;
  if (flagResult.error) throw flagResult.error;
  if (costResult.error) throw costResult.error;

  const cap = Number(flagResult.data.value ?? 2);
  const spent = (costResult.data ?? []).reduce((sum, row) => sum + Number(row.usd ?? 0), 0);
  return spent < cap;
}

async function writeReceipt(input: {
  worker: RunWorker;
  status: string;
  produced: number;
  costUsd: number;
  operatorEmail: string;
  note: string;
}) {
  const unit = input.worker === "quill" ? "drafts" : "findings";
  const claim = `Manual run ${input.status}: ${input.worker} produced ${input.produced} ${unit}, $${input.costUsd.toFixed(4)}`;
  const evidence = [
    `Requested by ${input.operatorEmail}.`,
    input.note ? `Note: ${input.note}` : null,
  ].filter(Boolean).join(" ");

  const { error } = await atlasDb().from("findings").insert({
    agent: "atlas-dispatcher",
    property: "general",
    channel: "general",
    claim,
    evidence,
    source_url: null,
    confidence: input.status === "complete" ? 0.9 : 0.5,
    tags: ["manual-run", "dispatcher", input.worker, input.status],
    pinned: true,
  });

  if (isMissingPinnedError(error)) {
    const { error: retryError } = await atlasDb().from("findings").insert({
      agent: "atlas-dispatcher",
      property: "general",
      channel: "general",
      claim,
      evidence,
      source_url: null,
      confidence: input.status === "complete" ? 0.9 : 0.5,
      tags: ["manual-run", "dispatcher", input.worker, input.status],
    });
    if (retryError) throw retryError;
  } else if (error) {
    throw error;
  }
}

function flagKey(worker: RunWorker) {
  return `run_${worker}_requested`;
}

function isMissingPinnedError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || Boolean(error?.message?.includes("pinned"));
}

console.log("atlas-dispatcher watching manual run flags every 60s.");
await tick();
setInterval(() => {
  tick().catch((error: unknown) => {
    console.error(error);
  });
}, intervalMs);
