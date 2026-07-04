import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedJobConfig, WorkerConfig } from "./config.js";
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

type XaiResponseContent = {
  type?: string;
  text?: string;
};

type XaiResponseOutput = {
  type?: string;
  content?: XaiResponseContent[];
};

type XaiResponse = {
  output_text?: string;
  output?: XaiResponseOutput[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

class XaiProvider implements LlmProvider {
  provider = "xai";
  model: string;
  private readonly apiKey: string;

  constructor(
    model: string,
    private readonly options: { liveSearch?: boolean; xSearch?: boolean } = {},
  ) {
    this.model = model;
    this.apiKey = requireEnv("XAI_API_KEY");
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const tools: Array<Record<string, unknown>> = [];

    if (this.options.liveSearch) {
      tools.push({ type: "web_search" });
    }

    if (this.options.xSearch) {
      tools.push({ type: "x_search" });
    }

    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: request.system,
        input: request.messages,
        max_output_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.2,
        ...(tools.length > 0 ? { tools } : {}),
      }),
    });

    const body = (await response.json()) as XaiResponse & {
      error?: { message?: string; type?: string };
    };

    if (!response.ok) {
      throw new Error(
        `xAI ${response.status}: ${body.error?.message ?? JSON.stringify(body.error ?? body)}`,
      );
    }

    const text =
      body.output_text ??
      body.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text" || item.type === "text")
        .map((item) => item.text ?? "")
        .join("\n")
        .trim() ??
      "";

    return {
      text,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      },
      provider: this.provider,
      model: this.model,
    };
  }
}

export function createProvider(config: WorkerConfig | ResolvedJobConfig): LlmProvider {
  if (config.provider === "anthropic") {
    return new AnthropicProvider(config.model);
  }

  if (config.provider === "xai") {
    return new XaiProvider(config.model, {
      liveSearch: "live_search" in config ? config.live_search : false,
      xSearch: "x_search" in config ? config.x_search : false,
    });
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}
