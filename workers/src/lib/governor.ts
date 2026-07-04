import type { WorkerConfig } from "./config.js";
import { atlasDb } from "./db.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "./provider.js";

export class GovernorStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernorStop";
  }
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function estimateUsd(config: WorkerConfig, inputTokens: number, outputTokens: number) {
  const inputUsd =
    (inputTokens / 1_000_000) * config.estimated_usd_per_million_input_tokens;
  const outputUsd =
    (outputTokens / 1_000_000) * config.estimated_usd_per_million_output_tokens;
  return Number((inputUsd + outputUsd).toFixed(6));
}

export class ModelGovernor {
  constructor(
    private readonly config: WorkerConfig,
    private readonly provider: LlmProvider,
  ) {}

  async complete(agent: string, request: LlmRequest): Promise<LlmResponse> {
    await this.assertCanSpend();
    const response = await this.provider.complete(request);
    await this.recordCost(agent, response);
    return response;
  }

  private async assertCanSpend() {
    const db = atlasDb();

    const { data: engineFlag, error: engineError } = await db
      .from("flags")
      .select("value")
      .eq("key", "engine_enabled")
      .single();

    if (engineError) throw engineError;
    if (engineFlag.value !== true) {
      throw new GovernorStop("atlas.flags.engine_enabled is false; no agent runs or spends.");
    }

    const { data: capFlag, error: capError } = await db
      .from("flags")
      .select("value")
      .eq("key", "daily_cost_cap_usd")
      .single();

    if (capError) throw capError;

    const dailyCap = Number(capFlag.value ?? 5);
    const { data: costs, error: costsError } = await db
      .from("costs")
      .select("usd")
      .gte("created_at", startOfTodayIso());

    if (costsError) throw costsError;

    const spentToday = (costs ?? []).reduce((sum, row) => sum + Number(row.usd ?? 0), 0);

    if (spentToday >= dailyCap) {
      throw new GovernorStop(
        `daily cost cap reached: spent ${spentToday.toFixed(4)} / cap ${dailyCap.toFixed(2)}`,
      );
    }
  }

  private async recordCost(agent: string, response: LlmResponse) {
    const usd = estimateUsd(
      this.config,
      response.usage.inputTokens,
      response.usage.outputTokens,
    );

    const { error } = await atlasDb().from("costs").insert({
      agent,
      provider: response.provider,
      tokens_in: response.usage.inputTokens,
      tokens_out: response.usage.outputTokens,
      usd,
    });

    if (error) throw error;
  }
}
