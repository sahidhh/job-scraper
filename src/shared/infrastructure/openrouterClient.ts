import { optionalEnv, requireEnv } from "./env";
import { fetchWithRetry } from "./http";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// scoring.md §3: requests have a timeout and one retry on timeout/5xx/429.
const REQUEST_TIMEOUT_MS = 15_000;

// scoring.md §3: output is a small JSON object (score float + 1-3 sentences).
// 300 tokens is ample for all valid responses. Omitting max_tokens causes
// OpenRouter to default to 65535, reserving far more credits than needed and
// triggering 402 errors once the balance drops below that reservation.
const DEFAULT_MAX_TOKENS = 300;

export type AiFailureReason =
  | "quota_exceeded"
  | "provider_rate_limit"
  | "provider_error"
  | "malformed_response"
  | "timeout"
  | "unknown";

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly reason: AiFailureReason,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

export interface OpenRouterJsonRequest {
  messages: OpenRouterMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface OpenRouterJsonResult {
  payload: unknown;
  usage: TokenUsage;
}

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function classifyStatus(status: number): AiFailureReason {
  if (status === 402) return "quota_exceeded";
  if (status === 429) return "provider_rate_limit";
  if (status >= 500) return "provider_error";
  return "unknown";
}

// Issues a single OpenRouter chat completion request constrained to a JSON
// schema. Returns the parsed JSON payload and token usage from the response.
// Throws OpenRouterError on timeout/non-2xx (after fetchWithRetry's one retry
// on 5xx/429) or a malformed response — callers decide how to handle failure
// (scoring.md §3 vs role expansion fallback).
export async function callOpenRouterJson(request: OpenRouterJsonRequest): Promise<OpenRouterJsonResult> {
  const apiKey = requireEnv("OPENROUTER_API_KEY");
  const model = requireEnv("OPENROUTER_MODEL");
  const maxTokens = Number(optionalEnv("OPENROUTER_MAX_TOKENS", String(DEFAULT_MAX_TOKENS)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchWithRetry(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        max_tokens: maxTokens,
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const reason = classifyStatus(response.status);
      console.warn(`[openrouter] model=${model} max_tokens=${maxTokens} status=${response.status} reason=${reason}`);
      throw new OpenRouterError(
        `OpenRouter request failed with status ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`,
        reason,
      );
    }

    const body = (await response.json()) as OpenRouterChatResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      console.warn(`[openrouter] model=${model} max_tokens=${maxTokens} status=200 reason=malformed_response`);
      throw new OpenRouterError("OpenRouter response missing message content", "malformed_response");
    }

    const usage: TokenUsage = {
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
    };

    return { payload: JSON.parse(content) as unknown, usage };
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    const reason: AiFailureReason = err instanceof Error && err.name === "AbortError" ? "timeout" : "unknown";
    console.warn(`[openrouter] model=${model} max_tokens=${maxTokens} reason=${reason}`);
    throw new OpenRouterError(err instanceof Error ? err.message : String(err), reason);
  } finally {
    clearTimeout(timeout);
  }
}
