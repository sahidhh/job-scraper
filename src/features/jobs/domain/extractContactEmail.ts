export type EmailCategory = "recruiter" | "hr" | "hiring_manager" | "company_contact";
export type EmailConfidence = "high" | "medium" | "low";

export interface ExtractedEmail {
  email: string;
  category: EmailCategory;
  confidence: EmailConfidence;
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Fully automated mailboxes -- never a useful human contact, always excluded.
const AUTOMATED_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "unsubscribe",
  "privacy",
  "mailer-daemon",
  "postmaster",
]);

// Local-part keyword -> category. Checked in priority order (Phase 2 Task 9:
// recruiter > hr > hiring manager > generic company contact) so an address
// matching multiple lists (unlikely, but possible) resolves to the
// highest-priority category.
const RECRUITER_KEYWORDS = ["recruit", "talent", "sourcing"];
const HR_KEYWORDS = ["humanresources", "peopleteam", "people", "hr"];
const HIRING_MANAGER_KEYWORDS = ["hiringmanager"];
// Generic/company-wide mailboxes -- a real inbox, just not a named person or
// dedicated recruiting/HR/hiring-manager address.
const COMPANY_CONTACT_KEYWORDS = ["careers", "jobs", "hiring", "apply", "info", "hello", "contact", "support"];

function categorize(localPart: string): { category: EmailCategory; confidence: EmailConfidence } {
  const normalized = localPart.toLowerCase().replace(/[._-]/g, "");

  if (RECRUITER_KEYWORDS.some((k) => normalized.includes(k))) return { category: "recruiter", confidence: "high" };
  if (HR_KEYWORDS.some((k) => normalized.includes(k))) return { category: "hr", confidence: "high" };
  if (HIRING_MANAGER_KEYWORDS.some((k) => normalized.includes(k))) return { category: "hiring_manager", confidence: "medium" };
  if (COMPANY_CONTACT_KEYWORDS.some((k) => normalized.includes(k))) return { category: "company_contact", confidence: "medium" };

  // No keyword match -- looks like a personal-name mailbox (e.g.
  // jane.doe@co.com). It's a real person, but the local part alone can't
  // tell us if they're a recruiter, a hiring manager, or unrelated -- avoid
  // AI/guessing, fall back to the lowest-confidence bucket.
  return { category: "company_contact", confidence: "low" };
}

const CATEGORY_PRIORITY: readonly EmailCategory[] = ["recruiter", "hr", "hiring_manager", "company_contact"];

/**
 * Extracts and categorizes the best contact email from job posting text
 * (title + description), preferring recruiter > HR > hiring manager >
 * generic company contact (Phase 2 Task 9). Deterministic regex + local-part
 * keyword heuristics, no AI. Automated/no-reply mailboxes are excluded.
 *
 * Only extracts from plain text -- structured-HTML and mailto: link
 * extraction are not implemented because scrapers already strip HTML to
 * plain text before a job reaches this point (docs/decisions.md AD-21).
 */
export function extractContactEmail(text: string): ExtractedEmail | null {
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;

  const seen = new Set<string>();
  const candidates: ExtractedEmail[] = [];

  for (const email of matches) {
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    const localPart = email.split("@")[0]!;
    if (AUTOMATED_PREFIXES.has(localPart.toLowerCase())) continue;

    candidates.push({ email, ...categorize(localPart) });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category));
  return candidates[0]!;
}
