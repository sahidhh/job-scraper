import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { skippedMissingCredential } from "../skipOutcomes";

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
      if (!apiKey) return skippedMissingCredential("OPENROUTER_API_KEY", "AI scoring / role expansion");

      try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return {
            status: "fail",
            summary: `OpenRouter returned HTTP ${response.status}`,
            probableCause: response.status === 401 || response.status === 403
              ? "OPENROUTER_API_KEY is invalid, revoked, or has been rotated."
              : "OpenRouter is experiencing an outage or rate-limiting this key.",
            suggestedFix: "Verify OPENROUTER_API_KEY in the OpenRouter dashboard and check https://status.openrouter.ai.",
            affectedSubsystem: "AI scoring / role expansion",
          };
        }
        const body = (await response.json()) as { data?: unknown[] };
        if (!Array.isArray(body.data)) {
          return {
            status: "fail",
            summary: "OpenRouter response did not include the expected `data` array",
            probableCause: "OpenRouter changed its /models response shape.",
            suggestedFix: "Check the OpenRouter API changelog; this check's assumption about the response shape may need updating.",
            affectedSubsystem: "AI scoring / role expansion",
          };
        }
        return { status: "pass", summary: `OpenRouter reachable (${body.data.length} models listed)` };
      } catch (err) {
        return {
          status: "fail",
          summary: `OpenRouter unreachable: ${err instanceof Error ? err.message : String(err)}`,
          probableCause: "Network access to openrouter.ai is blocked, or the request timed out after 8s.",
          suggestedFix: "Check network access and https://status.openrouter.ai.",
          affectedSubsystem: "AI scoring / role expansion",
        };
      }
    },
  };
}
