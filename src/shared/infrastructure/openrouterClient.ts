import { requireEnv } from "./env";
import { fetchWithRetry } from "./http";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// scoring.md §3: requests have a timeout and one retry on timeout/5xx.
const REQUEST_TIMEOUT_MS = 15_000;

export interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

export interface OpenRouterJsonRequest {
  messages: OpenRouterMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
}

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
}

// Issues a single OpenRouter chat completion request constrained to a JSON
// schema and returns the parsed JSON payload. Throws on timeout/non-2xx
// (after fetchWithRetry's one retry) or a malformed response -- callers
// decide how to handle failure (scoring.md §3 vs role expansion fallback).
export async function callOpenRouterJson(request: OpenRouterJsonRequest): Promise<unknown> {
  const apiKey = requireEnv("OPENROUTER_API_KEY");
  const model = requireEnv("OPENROUTER_MODEL");

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
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    const body = (await response.json()) as OpenRouterChatResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter response missing message content");
    }

    return JSON.parse(content) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}
