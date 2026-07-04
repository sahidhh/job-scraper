import { createHash } from "node:crypto";
import type { LocationTag } from "@/shared/domain/enums";
import { normalizeTitle } from "./normalizeTitle";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";

export interface FingerprintInput {
  title: string;
  companyName: string;
  locationTags: readonly LocationTag[];
}

/**
 * Deterministic cross-source duplicate key (Phase 1 Task 1): a job posted
 * on two different sources with the same normalized title, canonical
 * company, and location tags produces the same fingerprint. Cheap (string
 * hash, no fuzzy comparison, no AI) -- see SupabaseJobRepository.upsertMany
 * for how this gates insert-vs-skip.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const title = normalizeTitle(input.title);
  const company = normalizeCompanyName(input.companyName).toLowerCase();
  const location = [...input.locationTags].sort().join(",");

  return createHash("sha256").update(`${title}|${company}|${location}`).digest("hex");
}
