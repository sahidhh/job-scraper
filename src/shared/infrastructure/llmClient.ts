import { optionalEnv, requireEnv } from "./env";
import { fetchWithRetry } from "./http";
import { callOpenRouterCompletion, OpenRouterError, type AiFailureReason } from "./openrouterClient";

// Provider-agnostic LLM abstraction (merge-workspace Phase 3, mirrors
// jobhunt/llm.py's shape): switch providers with LLM_PROVIDER, no code
// change. Direct REST calls, same as openrouterClient.ts -- this codebase's
// established pattern for AI providers is fetchWithRetry + a typed error,
// not an SDK (see decisions.md AD-32).
//
// Distinct from AiScoreProvider/OpenRouterAiScoreProvider (scoring.md §3):
// that port scores jobs against a resume through OpenRouter's multi-model
// gateway with a strict JSON-schema constraint. This client is for resume
// suggestions/application drafts/careers extraction. AD-42: the default
// provider is now "openrouter" (routes through the SAME OpenRouter client
// and OPENROUTER_API_KEY scoring already requires, model
// google/gemini-2.5-flash) so drafting/suggestions no longer need a second
// provider key. "gemini"/"anthropic" (direct REST to those providers) stay
// available via LLM_PROVIDER for anyone who wants to route this feature
// through a different key/provider than scoring.
export type LlmProvider = "openrouter" | "gemini" | "anthropic";

const REQUEST_TIMEOUT_MS = 30_000;

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openrouter: "google/gemini-2.5-flash",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-haiku-4-5",
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly reason: AiFailureReason,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmCompleteRequest {
  system: string;
  user: string;
  maxTokens: number;
  // Nudges JSON-only output. Gemini supports a real response-mime-type
  // constraint; Anthropic does not, so callers must still parse leniently
  // (lenientJson.ts) regardless of this flag.
  jsonMode?: boolean;
}

export interface LlmCompleteResult {
  text: string;
  provider: LlmProvider;
  model: string;
}

export function currentLlmProvider(): LlmProvider {
  const value = optionalEnv("LLM_PROVIDER", "openrouter").toLowerCase();
  if (value === "anthropic") return "anthropic";
  if (value === "gemini") return "gemini";
  return "openrouter";
}

function currentModel(provider: LlmProvider): string {
  return optionalEnv("LLM_MODEL", DEFAULT_MODELS[provider]);
}

// Only the two status codes we can classify with confidence from public
// API docs -- unlike OpenRouter's gateway (classifyStatus in
// openrouterClient.ts), Gemini/Anthropic's exact 4xx semantics for
// quota-vs-auth aren't verified here, so anything else falls to "unknown"
// rather than guessing.
function classifyStatus(status: number): AiFailureReason {
  if (status === 429) return "provider_rate_limit";
  if (status >= 500) return "provider_error";
  return "unknown";
}

export async function completeLlm(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
  const provider = currentLlmProvider();
  const model = currentModel(provider);
  try {
    const text =
      provider === "anthropic"
        ? await callAnthropic(request, model)
        : provider === "gemini"
          ? await callGemini(request, model)
          : await callOpenRouter(request, model);
    return { text, provider, model };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof OpenRouterError) {
      console.warn(`[llm] provider=${provider} model=${model} reason=${err.reason}`);
      throw new LlmError(err.message, err.reason);
    }
    const reason: AiFailureReason = err instanceof Error && err.name === "AbortError" ? "timeout" : "unknown";
    console.warn(`[llm] provider=${provider} model=${model} reason=${reason}`);
    throw new LlmError(err instanceof Error ? err.message : String(err), reason);
  }
}

async function callOpenRouter(request: LlmCompleteRequest, model: string): Promise<string> {
  const { text } = await callOpenRouterCompletion({
    model,
    maxTokens: request.maxTokens,
    jsonMode: request.jsonMode,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
  });
  return text;
}

async function callGemini(request: LlmCompleteRequest, model: string): Promise<string> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const generationConfig: Record<string, unknown> = { maxOutputTokens: request.maxTokens };
  if (request.jsonMode) {
    generationConfig.responseMimeType = "application/json";
    // gemini-2.5-* are thinking models: thinking tokens eat into
    // maxOutputTokens, leaving little/nothing for the actual JSON. Disable
    // thinking for structured-extraction calls (jobhunt/llm.py's
    // `_gemini` does the same, for the same reason).
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        generationConfig,
      }),
    },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const reason = classifyStatus(response.status);
    console.warn(`[llm] provider=gemini model=${model} status=${response.status} reason=${reason}`);
    throw new LlmError(`Gemini request failed with status ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`, reason);
  }

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    const finishReason = body.candidates?.[0]?.finishReason ?? "unknown";
    console.warn(`[llm] provider=gemini model=${model} reason=malformed_response finish_reason=${finishReason}`);
    throw new LlmError(`Gemini response had no text (finish_reason=${finishReason})`, "malformed_response");
  }
  return text;
}

async function callAnthropic(request: LlmCompleteRequest, model: string): Promise<string> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");

  const response = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      }),
    },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const reason = classifyStatus(response.status);
    console.warn(`[llm] provider=anthropic model=${model} status=${response.status} reason=${reason}`);
    throw new LlmError(
      `Anthropic request failed with status ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`,
      reason,
    );
  }

  const body = (await response.json()) as { content?: { type?: string; text?: string }[] };
  const text = body.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  if (!text) {
    console.warn(`[llm] provider=anthropic model=${model} reason=malformed_response`);
    throw new LlmError("Anthropic response had no text content", "malformed_response");
  }
  return text;
}
