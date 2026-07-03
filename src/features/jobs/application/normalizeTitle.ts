import { normalizeWhitespace } from "@/shared/infrastructure/text";

// Seniority/level modifiers stripped entirely so "Senior Backend Engineer",
// "Backend Engineer - Senior", and "Sr Backend Engineer" all collapse to the
// same canonical title as plain "Backend Engineer" (Phase 1 Task 2). This is
// a deliberate tradeoff for cross-source duplicate detection, not a claim
// that the roles are identical -- see design/decisions.md.
const SENIORITY_TOKENS = new Set([
  "senior",
  "sr",
  "junior",
  "jr",
  "lead",
  "principal",
  "staff",
  "i",
  "ii",
  "iii",
  "iv",
  "1",
  "2",
  "3",
]);

// Word-level abbreviation expansion, applied after tokenizing. Deterministic,
// no AI. Extend this map as new abbreviations are observed in scraped titles.
const ABBREVIATIONS: Record<string, string> = {
  eng: "engineer",
  engr: "engineer",
  swe: "software engineer",
  dev: "developer",
  mgr: "manager",
  admin: "administrator",
  sw: "software",
  fe: "frontend",
  be: "backend",
  ml: "machine learning",
  qa: "quality assurance",
  hr: "human resources",
  ux: "user experience",
  ui: "user interface",
  vp: "vice president",
  swdev: "software developer",
};

const PUNCTUATION_PATTERN = /[^\p{L}\p{N}\s]/gu;

/**
 * Canonicalizes a job title for fingerprinting/duplicate detection:
 * lowercase, punctuation stripped, seniority modifiers removed, common
 * abbreviations expanded, whitespace collapsed. Deterministic, no AI, no
 * fuzzy comparison -- extend SENIORITY_TOKENS/ABBREVIATIONS for new cases.
 *
 * Not used for display -- `job.title` keeps the original scraped text.
 */
export function normalizeTitle(title: string): string {
  const lowered = normalizeWhitespace(title).toLowerCase();
  const stripped = lowered.replace(PUNCTUATION_PATTERN, " ");

  const tokens = normalizeWhitespace(stripped)
    .split(" ")
    .filter((token) => token.length > 0 && !SENIORITY_TOKENS.has(token))
    .map((token) => ABBREVIATIONS[token] ?? token);

  return tokens.join(" ").trim();
}
