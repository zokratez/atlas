import { atlasDb } from "./supabase";

export type Decision = "approve" | "kill" | "edit";
export type Verdict = "keep" | "kill" | "blemish";

export async function listFindings() {
  const { data, error } = await atlasDb()
    .from("findings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function listPendingActions() {
  const { data, error } = await atlasDb()
    .from("actions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function decideAction(
  actionId: string,
  decision: Decision,
  reason?: string,
) {
  const status = decision === "approve" ? "approved" : decision === "kill" ? "killed" : "pending";

  const { error: decisionError } = await atlasDb().from("decisions").insert({
    action_id: actionId,
    decision,
    reason: reason || null,
  });

  if (decisionError) throw decisionError;

  const { error: actionError } = await atlasDb()
    .from("actions")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", actionId);

  if (actionError) throw actionError;
}

export async function listExperiments() {
  const { data, error } = await atlasDb()
    .from("experiments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function setExperimentVerdict(id: string, verdict: Verdict) {
  const { error } = await atlasDb()
    .from("experiments")
    .update({ verdict, verdict_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function getEngineEnabled() {
  const { data, error } = await atlasDb()
    .from("flags")
    .select("value, updated_at")
    .eq("key", "engine_enabled")
    .single();

  if (error) throw error;
  return { enabled: data.value === true, updated_at: data.updated_at };
}

export async function setEngineEnabled(enabled: boolean) {
  const { data, error } = await atlasDb()
    .from("flags")
    .update({ value: enabled, updated_at: new Date().toISOString() })
    .eq("key", "engine_enabled")
    .select("value, updated_at")
    .single();

  if (error) throw error;
  return { enabled: data.value === true, updated_at: data.updated_at };
}

export async function getCostsSummary() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: flags, error: flagsError } = await atlasDb()
    .from("flags")
    .select("value")
    .eq("key", "daily_cost_cap_usd")
    .single();

  if (flagsError) throw flagsError;

  const { data, error } = await atlasDb()
    .from("costs")
    .select("created_at, agent, provider, usd")
    .gte("created_at", startOfMonth.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  const todayUsd = rows
    .filter((row) => new Date(row.created_at) >= startOfToday)
    .reduce((sum, row) => sum + Number(row.usd ?? 0), 0);
  const monthUsd = rows.reduce((sum, row) => sum + Number(row.usd ?? 0), 0);
  const capUsd = Number(flags.value ?? 5);

  return {
    todayUsd,
    monthUsd,
    capUsd,
    isNearCap: todayUsd >= capUsd * 0.8,
    rows: rows.slice(0, 25),
  };
}
