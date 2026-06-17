/**
 * Best-effort extraction of the MINIMUM required years of experience from a
 * job's free text (P2, soft filter). Returns the smallest plausible value
 * tied to a years-word, or null when nothing usable is found.
 *
 * Soft by design: null means "unknown" and must never exclude a job. Only a
 * number directly tied to a years-word counts, so unrelated numbers ("React
 * 18", "Top 5 company") are ignored. Matches are clamped to a plausible
 * 0..20 range; anything outside is dropped.
 */
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

  return min;
}
