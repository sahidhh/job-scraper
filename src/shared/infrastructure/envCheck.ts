// Shared env-var check primitives, extracted from scripts/doctor.ts so the
// same required/optional-var logic can be reused by the verification
// framework (src/features/verification) without duplicating it. Status
// vocabulary ("pass"/"warning"/"fail") matches the verification framework's
// CheckStatus exactly (operational-excellence pass, Phase 5) -- the two
// tools share this file, so they share one vocabulary too.
export type EnvCheckStatus = "pass" | "warning" | "fail";

export interface EnvCheckResult {
  status: EnvCheckStatus;
  label: string;
  detail: string;
}

export function checkRequiredVar(name: string): EnvCheckResult {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    return { status: "fail", label: name, detail: "missing (required)" };
  }
  return { status: "pass", label: name, detail: "set" };
}

export function checkOptionalVar(name: string, fallbackDescription: string): EnvCheckResult {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    return { status: "warning", label: name, detail: `not set — ${fallbackDescription}` };
  }
  return { status: "pass", label: name, detail: "set" };
}
