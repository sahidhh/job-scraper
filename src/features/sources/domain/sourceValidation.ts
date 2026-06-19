import type { JobSource } from "@/shared/domain/enums";

// Status returned by a single board probe.
// - healthy: 200, no redirect
// - redirected: final 200 after one or more redirects (board moved)
// - not_found: 404
// - unauthorized: 401 or 403
// - rate_limited: 429
// - unknown: any other status, or a network/timeout error
export type ValidationStatus =
  | "healthy"
  | "redirected"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "unknown";

export interface ValidationResult {
  companyName: string;
  boardToken: string;
  status: ValidationStatus;
  httpStatus: number | null;
}

export interface ValidationGroup {
  source: JobSource;
  results: ValidationResult[];
}

export interface SourceValidator {
  readonly source: JobSource;
  validate(boardToken: string, companyName: string): Promise<ValidationResult>;
}
