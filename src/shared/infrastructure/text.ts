// Normalization rule 1 (scrapers.md §3): HTML -> plain text, preserving
// line breaks for block-level elements, decoding common entities.
const BLOCK_BREAK_PATTERN = /<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi;
const TAG_PATTERN = /<[^>]*>/g;
const ENTITY_PATTERN = /&[a-z#0-9]+;/gi;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function stripHtml(html: string): string {
  const withBreaks = html.replace(BLOCK_BREAK_PATTERN, "\n");
  const withoutTags = withBreaks.replace(TAG_PATTERN, "");
  const decoded = withoutTags.replace(ENTITY_PATTERN, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);

  const lines = decoded
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0);

  return lines.join("\n").trim();
}

// Normalization rule 2 (scrapers.md §3): trim and collapse repeated
// whitespace in title/locationRaw/companyName.
export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function capitalizeFirst(tag: string): string {
  return tag.length === 0 ? tag : tag[0]!.toUpperCase() + tag.slice(1);
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
// Generic/automated prefixes unlikely to reach a recruiter.
const EXCLUDED_PREFIXES = new Set(["noreply", "no-reply", "support", "info", "privacy", "unsubscribe", "donotreply", "do-not-reply", "hello", "contact", "careers"]);

export function extractRecruiterEmail(text: string): string | null {
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;
  for (const email of matches) {
    const prefix = email.split("@")[0]!.toLowerCase();
    if (!EXCLUDED_PREFIXES.has(prefix)) return email;
  }
  return null;
}
