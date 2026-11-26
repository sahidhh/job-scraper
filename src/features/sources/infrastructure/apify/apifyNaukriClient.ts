import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import type { RawJob } from "@/features/sources/domain/types";

export type ScraperEnv = Readonly<Record<string, string | undefined>>;
export type ApifyJobBoard = "naukri" | "naukrigulf";

export interface ApifyNaukriRunInput {
  jobBoard: ApifyJobBoard;
  keyword: string;
  maxJobs: number;
  experience: string;
  freshness: string;
  fetchDetails: boolean;
  walkin?: boolean;
  /** NaukriGulf-only actor `country` filter (numeric codes, multi-value). */
  country?: readonly string[];
}

export interface ApifyClientConfig {
  token: string;
  actorId: string;
  maxCostUsd: number;
  timeoutSecs: number;
}

export const DEFAULT_ACTOR_ID = "muhammetakkurtt~naukri-job-scraper";
export const DEFAULT_MAX_COST_USD = 0.1;
export const DEFAULT_TIMEOUT_SECS = 120;
export const IST_OFFSET_MS = 330 * 60_000;

const MS_PER_DAY = 86_400_000;

/** Resolves Apify client settings from environment variables, or null if APIFY_TOKEN is missing. */
export function resolveApifyConfig(env: ScraperEnv = process.env): ApifyClientConfig | null {
  const token = env.APIFY_TOKEN?.trim();
  if (!token) return null;

  const actorId = env.APIFY_NAUKRI_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID;

  const rawMaxCost = env.APIFY_MAX_COST_PER_RUN_USD?.trim();
  const parsedMaxCost = rawMaxCost ? Number.parseFloat(rawMaxCost) : Number.NaN;
  const maxCostUsd = Number.isFinite(parsedMaxCost) && parsedMaxCost > 0 ? parsedMaxCost : DEFAULT_MAX_COST_USD;

  const timeoutSecs = parsePositiveInt(env.APIFY_TIMEOUT_SECS, DEFAULT_TIMEOUT_SECS);

  return {
    token,
    actorId,
    maxCostUsd,
    timeoutSecs,
  };
}

/** Returns the IST (UTC+5:30) day of week (0=Sun, 1=Mon, ..., 6=Sat). */
export function getIstDayOfWeek(now: Date = new Date()): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCDay();
}

/** Returns the integer IST day number since Unix epoch for deterministic rotation. */
export function getIstDayNumber(now: Date = new Date()): number {
  return Math.floor((now.getTime() + IST_OFFSET_MS) / MS_PER_DAY);
}

/** Returns a skip reason when a board is off-workweek or unconfigured, otherwise null. */
export function getWorkweekSkipReason(
  board: ApifyJobBoard,
  now: Date = new Date(),
  env: ScraperEnv = process.env,
): string | null {
  const forceFlag = (board === "naukri" ? env.NAUKRI_FORCE_RUN : env.NAUKRIGULF_FORCE_RUN)?.trim().toLowerCase();
  if (forceFlag === "true" || forceFlag === "1") {
    return null;
  }

  if (!resolveApifyConfig(env)) {
    return "APIFY_TOKEN not configured";
  }

  const day = getIstDayOfWeek(now);
  if (board === "naukri" && (day === 0 || day === 6)) {
    return "off-day for India (Sat/Sun IST)";
  }
  if (board === "naukrigulf" && day === 6) {
    return "off-day for GCC (Sat IST)";
  }

  return null;
}

/** Selects a deterministic rotating slice of unique non-empty keywords for the current IST day. */
export function selectRotatedKeywords(
  keywords: readonly string[],
  perRun: number,
  now: Date = new Date(),
): string[] {
  const cleaned = Array.from(new Set(keywords.map((kw) => kw.trim()).filter(Boolean)));
  if (cleaned.length === 0) return [];
  if (!Number.isFinite(perRun) || perRun <= 0 || perRun >= cleaned.length) {
    return [...cleaned];
  }

  const dayNum = getIstDayNumber(now);
  const start = (((dayNum * perRun) % cleaned.length) + cleaned.length) % cleaned.length;
  const selected: string[] = [];
  for (let i = 0; i < perRun; i += 1) {
    const kw = cleaned[(start + i) % cleaned.length];
    if (kw !== undefined) {
      selected.push(kw);
    }
  }
  return selected;
}

/** Parses a comma-separated keyword list, returning a copy of fallback when empty. */
export function parseKeywordList(raw: string | undefined, fallback: readonly string[]): string[] {
  if (!raw) return [...fallback];
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

/** Parses a positive base-10 integer from an env value, or returns fallback when invalid. */
export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Deduplicates jobs by sourceJobId and then collapses multi-city reposts sharing the
 * same company and normalized title, preferring Remote listings when duplicates exist.
 */
export function dedupeByCompanyAndTitle(jobs: readonly RawJob[]): RawJob[] {
  const seenIds = new Set<string>();
  const uniqueById: RawJob[] = [];

  for (const job of jobs) {
    if (seenIds.has(job.sourceJobId)) continue;
    seenIds.add(job.sourceJobId);
    uniqueById.push(job);
  }

  const result: RawJob[] = [];
  const keyToIndex = new Map<string, number>();

  for (const job of uniqueById) {
    const companyKey = job.companyName.toLowerCase().trim();
    const titleKey = job.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    if (!companyKey || !titleKey) {
      result.push(job);
      continue;
    }

    const dedupeKey = `${companyKey}::${titleKey}`;
    const existingIdx = keyToIndex.get(dedupeKey);

    if (existingIdx === undefined) {
      keyToIndex.set(dedupeKey, result.length);
      result.push(job);
      continue;
    }

    const existing = result[existingIdx];
    if (!existing) continue;
    const existingIsRemote = existing.locationRaw.toLowerCase().includes("remote");
    const candidateIsRemote = job.locationRaw.toLowerCase().includes("remote");
    if (candidateIsRemote && !existingIsRemote) {
      result[existingIdx] = job;
    }
  }

  return result;
}

/** Runs the Apify Naukri/NaukriGulf actor synchronously and returns its dataset items. */
export async function runApifyNaukriActor(
  input: ApifyNaukriRunInput,
  deps: { env?: ScraperEnv; fetchFn?: typeof fetch } = {},
): Promise<unknown[]> {
  const env = deps.env ?? process.env;
  const config = resolveApifyConfig(env);
  if (!config) {
    throw new SourceAuthExpiredError(input.jobBoard, 401, "APIFY_TOKEN not configured");
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(config.actorId)}` +
    `/run-sync-get-dataset-items?maxTotalChargeUsd=${config.maxCostUsd}&timeout=${config.timeoutSecs}`;

  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (res.status === 401 || res.status === 403) {
    throw new SourceAuthExpiredError(input.jobBoard, res.status, `Apify authentication failed (${res.status})`);
  }
  if (res.status === 402) {
    throw new SourceBlockedError(input.jobBoard, 402, "Apify monthly credit limit reached");
  }
  if (res.status === 429) {
    throw new SourceBlockedError(input.jobBoard, 429, "Apify rate limit exceeded");
  }
  if (!res.ok) {
    throw new SourceBlockedError(input.jobBoard, res.status, `Apify actor returned HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (!Array.isArray(body)) {
    throw new SourceBlockedError(input.jobBoard, res.status, "Apify actor returned non-array dataset");
  }

  return body;
}
