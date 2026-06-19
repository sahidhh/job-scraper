import type { JobMatch } from "@/features/notifications/domain/types";

// Scores at or above this are listed under "High Match"; lower go to "Medium Match".
export const HIGH_MATCH_THRESHOLD = 0.85;

// Telegram caps a single message at 4096 characters (HTML mode). Callers that
// might exceed this limit should use splitDigestChunks() before sending.
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

// Formats matched jobs into a single HTML digest string ready for Telegram
// (parse_mode "HTML"). All untrusted fields are HTML-escaped.
// Matches are expected to be sorted descending by aiScore (as returned by
// findUnnotifiedMatches).
export function formatDigestMessage(matches: JobMatch[]): string {
  if (matches.length === 0) {
    return "📋 <b>Jobs Digest</b>\n\nNo new matches.";
  }

  const high = matches.filter((m) => m.aiScore >= HIGH_MATCH_THRESHOLD);
  const medium = matches.filter((m) => m.aiScore < HIGH_MATCH_THRESHOLD);
  const companies = [...new Set(matches.map((m) => m.companyName))];

  const lines: string[] = ["📋 <b>Jobs Digest</b>"];

  if (high.length > 0) {
    lines.push("", `<b>High Match</b> (≥${Math.round(HIGH_MATCH_THRESHOLD * 100)}%)`);
    for (const m of high) {
      lines.push("", formatEntry(m));
    }
  }

  if (medium.length > 0) {
    lines.push("", "<b>Medium Match</b>");
    for (const m of medium) {
      lines.push("", formatEntry(m));
    }
  }

  lines.push("", "<b>New Companies</b>");
  for (const c of companies) {
    lines.push(`• ${escapeHtml(c)}`);
  }

  lines.push(
    "",
    "<b>Summary</b>",
    `${matches.length} job${matches.length === 1 ? "" : "s"} processed`,
    `${high.length} high-value job${high.length === 1 ? "" : "s"}`,
  );

  return lines.join("\n");
}

// Splits a digest string into chunks that fit within Telegram's per-message
// character limit, breaking only on line boundaries.
export function splitDigestChunks(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (next.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      if (current.length > 0) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function formatEntry(match: JobMatch): string {
  const percent = Math.round(match.aiScore * 100);
  const location = match.locationTags.map(capitalize).join(", ");
  return [
    `🎯 ${percent}% — ${escapeHtml(match.title)} @ ${escapeHtml(match.companyName)}`,
    `📍 ${location} · ${escapeHtml(match.url)}`,
  ].join("\n");
}

function capitalize(tag: string): string {
  return tag.length === 0 ? tag : tag[0]!.toUpperCase() + tag.slice(1);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
