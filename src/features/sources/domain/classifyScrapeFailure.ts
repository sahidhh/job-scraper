// Failure taxonomy for scrape_runs (Phase 1 Task 5/7). Deterministic
// keyword/status-code heuristics on the thrown error's message -- no AI, no
// network re-inspection. "selector" and "captcha" are extension points: no
// current adapter does HTML/DOM scraping or hits a CAPTCHA wall, but the
// category exists so a future adapter (or Wellfound switching off its feed
// URL) has somewhere to report it.
export type FailureCategory =
  | "timeout"
  | "parsing"
  | "selector"
  | "captcha"
  | "blocked"
  | "authentication"
  | "rate_limited"
  | "not_found"
  | "empty_feed"
  | "unknown";

interface StatusRule {
  status: number;
  category: FailureCategory;
}

// Checked before keyword rules: an embedded HTTP status code (adapters throw
// messages like `Greenhouse board "x" returned 404`) is a stronger signal
// than a keyword match on the surrounding text.
const STATUS_RULES: StatusRule[] = [
  { status: 401, category: "authentication" },
  { status: 403, category: "blocked" }, // public unauthenticated board APIs -- 403 reads as bot-blocking, not credentials
  { status: 404, category: "not_found" },
  { status: 429, category: "rate_limited" },
];

// Checked in order; first match wins. Keep specific terms before generic
// ones (e.g. "captcha" before "blocked").
const KEYWORD_RULES: [RegExp, FailureCategory][] = [
  [/captcha/i, "captcha"],
  [/timed?\s*out|timeout|etimedout|aborterror/i, "timeout"],
  [/selector|queryselector/i, "selector"],
  [/unauthorized|invalid.*(token|key|credential)/i, "authentication"],
  [/forbidden|blocked|bot.?detect|cloudflare/i, "blocked"],
  [/rate.?limit|too many requests/i, "rate_limited"],
  [/not found/i, "not_found"],
  [/unexpected token|is not a function|is not iterable|cannot read propert|json/i, "parsing"],
];

/**
 * Classifies a thrown scrape error into a fixed category for observability
 * (scrape_runs.failure_category). Falls back to "unknown" when no rule
 * matches -- never throws.
 */
export function classifyScrapeFailure(error: unknown): FailureCategory {
  const message = error instanceof Error ? error.message : String(error);

  const statusMatch = message.match(/\b(\d{3})\b/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    const rule = STATUS_RULES.find((r) => r.status === status);
    if (rule) return rule.category;
  }

  for (const [pattern, category] of KEYWORD_RULES) {
    if (pattern.test(message)) return category;
  }

  return "unknown";
}
