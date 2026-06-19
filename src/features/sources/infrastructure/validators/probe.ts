import type { ValidationResult, ValidationStatus } from "@/features/sources/domain/sourceValidation";

const PROBE_TIMEOUT_MS = 10_000;

function toValidationStatus(httpStatus: number, redirected: boolean): ValidationStatus {
  if (httpStatus === 200 && redirected) return "redirected";
  if (httpStatus === 200) return "healthy";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 401 || httpStatus === 403) return "unauthorized";
  if (httpStatus === 429) return "rate_limited";
  return "unknown";
}

// Performs a lightweight GET probe against a board URL and maps the HTTP
// response to a ValidationStatus. Does not retry — a single failure is
// sufficient to flag a dead board. Network errors and timeouts yield "unknown".
export async function probeBoard(
  url: string,
  boardToken: string,
  companyName: string,
): Promise<ValidationResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return {
      companyName,
      boardToken,
      status: toValidationStatus(response.status, response.redirected),
      httpStatus: response.status,
    };
  } catch {
    return {
      companyName,
      boardToken,
      status: "unknown",
      httpStatus: null,
    };
  }
}
