import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getWorkersRoot } from "./env.js";

export type ResearchTarget = {
  name: string;
  property: string;
  tags: string[];
  urls: string[];
  questions: string[];
};

export type ProviderName = "anthropic" | "xai";

export type JobName = "scout" | "lens" | "scout-pulse" | "quill" | "producer";

export type JobConfig = {
  provider: ProviderName;
  model: string;
  max_findings_per_run?: number;
  live_search?: boolean;
  x_search?: boolean;
  estimated_usd_per_million_input_tokens?: number;
  estimated_usd_per_million_output_tokens?: number;
};

export type WorkerConfig = {
  provider: ProviderName;
  model: string;
  max_findings_per_night: number;
  estimated_usd_per_million_input_tokens: number;
  estimated_usd_per_million_output_tokens: number;
  jobs?: Partial<Record<JobName, JobConfig>>;
  properties: string[];
  research_targets: ResearchTarget[];
};

export type ResolvedJobConfig = {
  name: JobName;
  provider: ProviderName;
  model: string;
  max_findings_per_run: number;
  live_search: boolean;
  x_search: boolean;
  estimated_usd_per_million_input_tokens: number;
  estimated_usd_per_million_output_tokens: number;
};

export function loadConfig(): WorkerConfig {
  const configPath = path.resolve(
    getWorkersRoot(),
    process.env.ATLAS_WORKER_CONFIG ?? "./config.yaml",
  );
  const raw = fs.readFileSync(configPath, "utf8");
  const config = YAML.parse(raw) as WorkerConfig;

  if (config.provider !== "anthropic" && config.provider !== "xai") {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  if (!config.model || !config.max_findings_per_night) {
    throw new Error("Worker config missing model or max_findings_per_night.");
  }

  return config;
}

export function jobConfig(config: WorkerConfig, name: JobName): ResolvedJobConfig {
  const job = config.jobs?.[name];

  return {
    name,
    provider: job?.provider ?? config.provider,
    model: job?.model ?? config.model,
    max_findings_per_run: job?.max_findings_per_run ?? config.max_findings_per_night,
    live_search: job?.live_search ?? false,
    x_search: job?.x_search ?? false,
    estimated_usd_per_million_input_tokens:
      job?.estimated_usd_per_million_input_tokens ??
      config.estimated_usd_per_million_input_tokens,
    estimated_usd_per_million_output_tokens:
      job?.estimated_usd_per_million_output_tokens ??
      config.estimated_usd_per_million_output_tokens,
  };
}
