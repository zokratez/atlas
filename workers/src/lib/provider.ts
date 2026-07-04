import Anthropic from "@anthropic-ai/sdk";
import type { WorkerConfig } from "./config.js";
import { requireEnv } from "./env.js";

export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LlmResponse = {
  text: string;
  usage: LlmUsage;
  provider: string;
  model: string;
};

export interface LlmProvider {
  provider: string;
  model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

class AnthropicProvider implements LlmProvider {
  provider = "anthropic";
  model: string;
  private client: Anthropic;

  constructor(model: string) {
    this.model = model;
    this.client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      system: request.system,
      messages: request.messages,
    });

    const text = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      provider: this.provider,
      model: this.model,
    };
  }
}

export function createProvider(config: WorkerConfig): LlmProvider {
  if (config.provider === "anthropic") {
    return new AnthropicProvider(config.model);
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}
