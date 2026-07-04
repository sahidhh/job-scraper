import { timingSafeEqual } from "node:crypto";
import { STRONG_MATCH_THRESHOLD } from "@/features/notifications/domain/types";
import { escapeHtml } from "@/shared/infrastructure/text";

const PAGE_SIZE = 5;

export function isValidSecret(secret: string | undefined, header: string | null): boolean {
  if (!secret || !header) return false;
  const secretBuf = Buffer.from(secret);
  const headerBuf = Buffer.from(header);
  return secretBuf.length === headerBuf.length && timingSafeEqual(secretBuf, headerBuf);
}

export function formatPage(
  jobs: { title: string; companyName: string; url: string; aiScore: number }[],
  page: number,
  totalPages: number,
  total: number,
): string {
  const header = `📋 <b>Worth Reviewing</b> — Page ${page + 1}/${totalPages} (${total} total)\n`;
  const lines = jobs.map(
    (j, i) =>
      `\n${page * PAGE_SIZE + i + 1}. <b>${escapeHtml(j.title)}</b> — ${escapeHtml(j.companyName)}\n` +
      `   Score: ${Math.round(j.aiScore * 100)}% | <a href="${escapeHtml(j.url)}">Apply</a>`,
  );
  return header + lines.join("");
}

export function buildButtons(
  page: number,
  totalPages: number,
): { text: string; callback_data?: string; url?: string }[][] {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "← Prev", callback_data: `wr:${page - 1}` });
  if (page < totalPages - 1) navRow.push({ text: "Next →", callback_data: `wr:${page + 1}` });

  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  if (navRow.length > 0) rows.push(navRow);
  if (appUrl) rows.push([{ text: "📊 Dashboard", url: `${appUrl}/dashboard?minScore=${STRONG_MATCH_THRESHOLD}` }]);
  return rows;
}

export { PAGE_SIZE };
