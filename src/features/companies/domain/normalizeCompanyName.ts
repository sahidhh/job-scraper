import { normalizeWhitespace, capitalizeFirst } from "@/shared/infrastructure/text";

// Legal-entity suffixes stripped so "Google LLC" / "Google Inc." / "Acme
// Corp" collapse to the same canonical company as "Google" / "Acme"
// (Phase 1 Task 3). Deterministic dictionary, no AI -- extend as needed.
const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "plc",
  "gmbh",
  "pvt",
  "pte",
  "llp",
]);

// Regional/office qualifiers stripped when trailing so "Google India" and
// "Google Singapore" collapse to "Google". Only stripped from the end of
// the name to avoid mangling a company whose actual name contains one of
// these words elsewhere.
const REGIONAL_SUFFIXES = new Set([
  "india",
  "singapore",
  "uae",
  "us",
  "usa",
  "uk",
  "europe",
  "emea",
  "apac",
  "global",
  "worldwide",
]);

const PUNCTUATION_PATTERN = /[^\p{L}\p{N}\s]/gu;

/**
 * Canonicalizes a company name for fingerprinting/analytics grouping:
 * lowercase, punctuation stripped, trailing legal-entity and regional-office
 * suffixes removed, whitespace collapsed, then re-capitalized for display.
 * Deterministic, no AI. The original `job.company_name` is always preserved
 * alongside this value -- see design/erd.md.
 */
export function normalizeCompanyName(name: string): string {
  const lowered = normalizeWhitespace(name).toLowerCase();
  const stripped = lowered.replace(PUNCTUATION_PATTERN, " ");

  let tokens = normalizeWhitespace(stripped)
    .split(" ")
    .filter((token) => token.length > 0);

  // Strip trailing legal/regional suffixes repeatedly (e.g. "Acme Corp
  // India" -> drop "india" then "corp" -> "acme"), but never strip the
  // last remaining token so a company literally named "Inc" or "India"
  // doesn't normalize to an empty string.
  while (tokens.length > 1 && (LEGAL_SUFFIXES.has(tokens[tokens.length - 1]!) || REGIONAL_SUFFIXES.has(tokens[tokens.length - 1]!))) {
    tokens = tokens.slice(0, -1);
  }

  return tokens.map(capitalizeFirst).join(" ");
}
