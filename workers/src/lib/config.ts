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

export type WorkerConfig = {
  provider: "anthropic";
  model: string;
  max_findings_per_night: number;
  estimated_usd_per_million_input_tokens: number;
  estimated_usd_per_million_output_tokens: number;
  properties: string[];
  research_targets: ResearchTarget[];
};

export function loadConfig(): WorkerConfig {
  const configPath = path.resolve(
    getWorkersRoot(),
    process.env.ATLAS_WORKER_CONFIG ?? "./config.yaml",
  );
  const raw = fs.readFileSync(configPath, "utf8");
  const config = YAML.parse(raw) as WorkerConfig;

  if (config.provider !== "anthropic") {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  if (!config.model || !config.max_findings_per_night) {
    throw new Error("Worker config missing model or max_findings_per_night.");
  }

  return config;
}
