import type { JobMatch } from "@/features/notifications/domain/types";
import { capitalizeFirst, escapeHtml } from "@/shared/infrastructure/text";

// Telegram message format (scoring.md §4), sent with parse_mode "HTML"
// (TelegramBotSender) -- title/companyName/aiReasoning/url come from
// scraped postings and AI output (untrusted), so they're HTML-escaped
// before interpolation (security-audit.md Finding #2):
//
//   🎯 New match (87%)
//   Senior React Developer @ Acme Corp
//   📍 Remote
//   <reasoning excerpt>
//   <job url>
export function formatMatchMessage(match: JobMatch): string {
  const percent = Math.round(match.aiScore * 100);
  const location = match.locationTags.map(capitalizeFirst).join(", ");

  const lines = [
    `🎯 New match (${percent}%)`,
    `${escapeHtml(match.title)} @ ${escapeHtml(match.companyName)}`,
    `📍 ${location}`,
  ];

  if (match.aiReasoning) {
    lines.push(escapeHtml(match.aiReasoning));
  }

  lines.push(escapeHtml(match.url));

  return lines.join("\n");
}
