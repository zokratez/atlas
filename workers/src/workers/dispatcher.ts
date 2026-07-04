import { atlasDb } from "../lib/db.js";
import { GovernorStop } from "../lib/governor.js";
import { main as runLens } from "./lens.js";
import { main as runQuill } from "./quill.js";
import { main as runScout } from "./scout.js";

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
    for (const worker of runOrder) {
      const request = await takeRequest(worker);
      if (!request) continue;
      await runManual(worker, request);
    }
  } finally {
    running = false;
  }
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
