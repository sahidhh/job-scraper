import { buildJobHighlights } from "@/features/notifications/application/buildJobHighlights";
import type { JobMatch } from "@/features/notifications/domain/types";
import { computeFreshnessBoost } from "@/features/scoring/application/computeOverallScore";
import { capitalizeFirst, escapeHtml } from "@/shared/infrastructure/text";

/**
 * Formats a single job match as a compact HTML card for Telegram delivery.
 */
export function formatJobCard(match: JobMatch, now: Date = new Date()): string {
  const location = match.locationTags.map(capitalizeFirst).join(", ");
  const expStr = match.minYears !== null ? `${match.minYears}+ yrs` : null;
  const meta = [escapeHtml(match.companyName), escapeHtml(location), expStr].filter(Boolean).join(" · ");

  const percent = Math.round((match.overallScore ?? match.aiScore) * 100);
  const isFresh = computeFreshnessBoost(match.postedAt, now) > 0;
  const scoreLine = isFresh ? `🎯 ${percent}% · 🆕 ${escapeHtml("<24h")}` : `🎯 ${percent}%`;

  const lines = [`<b>${escapeHtml(match.title)}</b>`, meta, scoreLine];

  const highlights = buildJobHighlights(match);
  if (highlights.length > 0) {
    lines.push(escapeHtml(highlights.join(" · ")));
  }

  return lines.join("\n");
}
