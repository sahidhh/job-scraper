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

export function checkRequiredVar(...names: [string, ...string[]]): EnvCheckResult {
  const primary = names[0];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim().length > 0) {
      return {
        status: "pass",
        label: primary,
        detail: name === primary ? "set" : `set via ${name} (legacy)`,
      };
    }
  }
  const detail =
    names.length === 1
      ? "missing (required)"
      : `missing (required; legacy ${names.slice(1).join("/")} also unset)`;
  return { status: "fail", label: primary, detail };
}

export function checkOptionalVar(name: string, fallbackDescription: string): EnvCheckResult {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    return { status: "warning", label: name, detail: `not set — ${fallbackDescription}` };
  }
  return { status: "pass", label: name, detail: "set" };
}
