export type SalaryPeriod = "yearly" | "monthly" | "hourly";
export type SalaryConfidence = "high" | "medium" | "low";

export interface ExtractedSalary {
  currency: string | null;
  min: number | null;
  max: number | null;
  period: SalaryPeriod | null;
  confidence: SalaryConfidence;
}

// Explicit "no figure given" phrasing -- worth recording (a salary section
// exists) distinct from no salary mention at all (extractSalary returns
// null for that case, see below).
const NO_FIGURE_PATTERN = /\b(negotiable|competitive|doe|depends on experience|discussed at interview)\b/i;

const NUMBER = String.raw`[\d][\d,]*(?:\.\d+)?`;
const RANGE_SEP = String.raw`(?:\s*(?:-|–|—|to)\s*)`;
const PERIOD_WORD = String.raw`(?:year|yr|annum|pa|month|mo|hour|hr)`;

// Tried in priority order -- each requires a currency symbol, currency
// code, LPA/lakh unit, or explicit period phrase directly attached to the
// number(s), so a bare number elsewhere in the description (e.g. "5+ years
// of experience") is never mistaken for a salary figure.
const PATTERNS: RegExp[] = [
  // ₹18-24 LPA, $120k/year, S$8,000-10,000/month, Rs. 50,000/month
  new RegExp(
    String.raw`(₹|S\$|\$|\bRs\.?)\s*(${NUMBER})${RANGE_SEP}?(${NUMBER})?\s*(k|lpa|lakhs?)?\s*(?:\/\s*|per\s*)?(${PERIOD_WORD})?`,
    "i",
  ),
  // 20 LPA, 35 USD/hour, 120,000 INR per month, 8-10 lakhs
  new RegExp(
    String.raw`(${NUMBER})${RANGE_SEP}?(${NUMBER})?\s*(USD|INR|SGD|AED|LPA|lakhs?)\s*(?:\/\s*|per\s*)?(${PERIOD_WORD})?`,
    "i",
  ),
  // 5000-7000 per month (period given, no currency at all -- ambiguous currency)
  new RegExp(String.raw`(${NUMBER})${RANGE_SEP}?(${NUMBER})?\s*(?:\/\s*|per\s*)(${PERIOD_WORD})`, "i"),
];

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizePeriod(word: string | undefined): SalaryPeriod | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (w === "year" || w === "yr" || w === "annum" || w === "pa") return "yearly";
  if (w === "month" || w === "mo") return "monthly";
  if (w === "hour" || w === "hr") return "hourly";
  return null;
}

function normalizeCurrency(symbolOrCode: string | undefined): string | null {
  if (!symbolOrCode) return null;
  const s = symbolOrCode.toLowerCase();
  if (s === "₹" || s === "inr" || s === "rs" || s === "rs.") return "INR";
  if (s === "s$" || s === "sgd") return "SGD";
  if (s === "aed") return "AED";
  if (s === "$" || s === "usd") return "USD";
  if (s === "lpa" || s.startsWith("lakh")) return "INR"; // India-specific unit implies the currency
  return null;
}

function unitMultiplier(unit: string | undefined): number {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === "k") return 1_000;
  if (u === "lpa" || u.startsWith("lakh")) return 100_000; // 1 lakh = 100,000
  return 1;
}

/**
 * Extracts and normalizes a salary figure from job posting text (Phase 2
 * Task 10). Deterministic regex only, no AI. Returns:
 *  - an ExtractedSalary with numeric fields when a figure is found,
 *  - an ExtractedSalary with all-null numeric fields (confidence 'low')
 *    for explicit "Negotiable"/"Competitive"-style text with no figure,
 *  - null when there is no salary-related text at all.
 */
export function extractSalary(text: string): ExtractedSalary | null {
  for (const pattern of PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    // Each pattern's groups vary in count/position; normalize by pattern index.
    const isSymbolFirst = pattern === PATTERNS[0];
    const isCodeSecond = pattern === PATTERNS[1];

    let currencyToken: string | undefined;
    let unitToken: string | undefined;
    let firstNumber: string | undefined;
    let secondNumber: string | undefined;
    let periodToken: string | undefined;

    if (isSymbolFirst) {
      [, currencyToken, firstNumber, secondNumber, unitToken, periodToken] = match;
    } else if (isCodeSecond) {
      [, firstNumber, secondNumber, currencyToken, periodToken] = match;
      // In this pattern the same captured token (e.g. "LPA"/"lakhs") is
      // both the currency signal and the magnitude unit.
      unitToken = currencyToken;
    } else {
      [, firstNumber, secondNumber, periodToken] = match;
    }

    const currency = normalizeCurrency(currencyToken);
    // LPA/lakh inherently means "per annum" -- infer yearly when no more
    // specific period phrase was also present.
    const period = normalizePeriod(periodToken) ?? (unitMultiplier(unitToken) === 100_000 ? "yearly" : null);

    // Require at least one real signal (currency, LPA/lakh unit, or an
    // explicit period) -- otherwise this "match" is just a bare number and
    // not a salary figure at all.
    if (!currency && !unitToken && !period) continue;

    const multiplier = unitMultiplier(unitToken);
    const min = parseNumber(firstNumber);
    if (min === null) continue;
    const maxRaw = parseNumber(secondNumber);
    const max = maxRaw ?? min;

    const confidence: SalaryConfidence = currency && period ? "high" : "medium";

    return {
      currency,
      min: min * multiplier,
      max: max * multiplier,
      period,
      confidence,
    };
  }

  if (NO_FIGURE_PATTERN.test(text)) {
    return { currency: null, min: null, max: null, period: null, confidence: "low" };
  }

  return null;
}
