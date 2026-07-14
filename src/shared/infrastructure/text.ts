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

// Escapes the 4 entities Telegram's HTML parse mode recognizes (&lt; &gt;
// &amp; &quot;) -- quote escaping matters when the escaped value is placed
// inside an HTML attribute (e.g. <a href="...">), not just a text node.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function capitalizeFirst(tag: string): string {
  return tag.length === 0 ? tag : tag[0]!.toUpperCase() + tag.slice(1);
}

// AI prompt-cost control (Phase 3 Task 11-12): caps how much of a long text
// (resume, job description) is sent to a paid LLM call. A hard character
// slice, not a token count, is deliberate -- exact tokenization is
// model-specific and this only needs to be a cheap, deterministic upper
// bound, not a precise budget.
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}... [truncated]`;
}

// Resume-suggestions chunking (decisions.md AD-33, jobhunt bug #2):
// jobhunt/enhance.py truncates via `text[:12000]`, silently dropping
// everything past the cap. This splits text into <=maxChars chunks instead,
// so a long resume gets fully processed across multiple LLM calls rather
// than losing its tail. Breaks on the last newline before the cap when one
// exists (keeps chunks from splitting mid-line); always makes forward
// progress even if no newline is found.
export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lastBreak = text.lastIndexOf("\n", end);
      if (lastBreak > start) end = lastBreak;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end;
  }
  return chunks;
}
