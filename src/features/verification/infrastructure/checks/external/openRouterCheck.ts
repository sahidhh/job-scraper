import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/**
 * Lightweight OpenRouter reachability check -- hits the public /models
 * listing endpoint (no token cost, unlike a chat completion) with a short
 * timeout. Validates the API is reachable and the key is accepted by the
 * gateway; does not spend any completion tokens.
 */
export function openRouterConnectivityCheck(): Check {
  return {
    id: "external.openrouter",
    name: "OpenRouter connectivity",
    category: "external",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return { status: "warning", summary: "Skipped — OPENROUTER_API_KEY not set" };

      try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return {
            status: "fail",
            summary: `OpenRouter returned HTTP ${response.status}`,
            recommendation: "Verify OPENROUTER_API_KEY is valid and OpenRouter is not experiencing an outage.",
          };
        }
        const body = (await response.json()) as { data?: unknown[] };
        if (!Array.isArray(body.data)) {
          return { status: "fail", summary: "OpenRouter response did not include the expected `data` array" };
        }
        return { status: "pass", summary: `OpenRouter reachable (${body.data.length} models listed)` };
      } catch (err) {
        return {
          status: "fail",
          summary: `OpenRouter unreachable: ${err instanceof Error ? err.message : String(err)}`,
          recommendation: "Check network access and https://status.openrouter.ai.",
        };
      }
    },
  };
}
