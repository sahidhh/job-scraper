/**
 * Best-effort extraction of the MINIMUM required years of experience from a
 * job's free text (P2, soft filter). Returns the smallest plausible value
 * tied to a years-word, or null when nothing usable is found.
 *
 * Soft by design: null means "unknown" and must never exclude a job. Only a
 * number directly tied to a years-word counts, so unrelated numbers ("React
 * 18", "Top 5 company") are ignored. Matches are clamped to a plausible
 * 0..20 range; anything outside is dropped.
 *
 * When no numeric year pattern is found, a seniority-label fallback is applied
 * (title segment first, then description body). This is a lower-precision
 * signal, so a numeric match always wins over a seniority label.
 *
 * Assumption: company names do not appear in the job title segment. The
 * title-first approach therefore suppresses noise like a company called
 * "Senior Solutions Inc." appearing in the description body.
 */

/**
 * Maps seniority label regex patterns to min_years values.
 * Priority rule: if multiple labels match within the same segment, the highest
 * value wins (most restrictive), because a compound title like
 * "Senior Principal Engineer" implies the higher bar.
 */
const SENIORITY_PATTERNS: Array<{ pattern: RegExp; years: number }> = [
  // entry-level / junior — 0
  { pattern: /\bentry[\s-]level\b/i, years: 0 },
  { pattern: /\bjunior\b/i, years: 0 },
  { pattern: /\bjr\.\s/i, years: 0 },
  { pattern: /\bjr\b/i, years: 0 },
  // mid-level — 3
  { pattern: /\bmid[\s-]senior\b/i, years: 3 },
  { pattern: /\bmid[\s-]level\b/i, years: 3 },
  // senior — 5 (negative lookbehind excludes "mid senior" which maps to 3)
  { pattern: /\b(?<!mid[\s-])senior\b/i, years: 5 },
  { pattern: /\bsr\.\s/i, years: 5 },
  { pattern: /\bsr\b/i, years: 5 },
  // lead — 7
  { pattern: /\b(?:tech|team)\s+lead\b/i, years: 7 },
  { pattern: /\blead\b/i, years: 7 },
  // staff (as a job level, e.g. "Staff Engineer") — 8
  { pattern: /\bstaff\b/i, years: 8 },
  // principal — 10
  { pattern: /\bprincipal\b/i, years: 10 },
];

/**
 * Scans a single text segment for seniority labels, returning the highest
 * matched value (most restrictive) or null if none match.
 */
function matchSeniority(segment: string): number | null {
  let max: number | null = null;
  for (const { pattern, years } of SENIORITY_PATTERNS) {
    if (pattern.test(segment) && (max === null || years > max)) {
      max = years;
    }
  }
  return max;
}

export function parseMinYears(text: string): number | null {
  // (?<!\d) avoids matching inside a longer number ("100 years"). The
  // optional `+` / `-N` covers "5+ years" and "3-5 years" (the leading
  // number is the minimum). Unit variants: year(s) / yr(s).
  const regex = /(?<!\d)(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:years|year|yrs|yr)\b/gi;

  let min: number | null = null;
  for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 0 && value <= 20 && (min === null || value < min)) {
      min = value;
    }
  }

  // Numeric match is more precise — return it immediately if found.
  if (min !== null) {
    return min;
  }

  // Seniority-label fallback: check the title segment first (split on the
  // first newline), then the description body if the title yields nothing.
  const newlineIdx = text.indexOf("\n");
  const title = newlineIdx === -1 ? text : text.slice(0, newlineIdx);
  const body = newlineIdx === -1 ? "" : text.slice(newlineIdx + 1);

  const titleMatch = matchSeniority(title);
  if (titleMatch !== null) {
    return titleMatch;
  }

  return matchSeniority(body);
}
