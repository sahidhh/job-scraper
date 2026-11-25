import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { hasRoleFilter, jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import {
  dedupeByCompanyAndTitle,
  getWorkweekSkipReason,
  parseKeywordList,
  parsePositiveInt,
  runApifyNaukriActor,
  selectRotatedKeywords,
  type ScraperEnv,
} from "../apify/apifyNaukriClient";
import { toIsoFromUnixSeconds, toIsoOrNull } from "../normalize";

const NAUKRIGULF_BASE_URL = "https://www.naukrigulf.com";

export const DEFAULT_KEYWORDS = [".NET Developer", "Full Stack Developer", "Software Engineer"] as const;
export const DEFAULT_KEYWORDS_PER_RUN = 2;
export const DEFAULT_MAX_JOBS = 50;
export const DEFAULT_EXPERIENCE = "2";
export const DEFAULT_FRESHNESS = "3";
export const DEFAULT_FETCH_DETAILS = true;

export interface NaukriGulfScraperDeps {
  fetchFn?: typeof fetch;
  env?: ScraperEnv;
  nowFn?: () => Date;
}

export interface NaukriGulfJobEntry {
  jobId?: string | number;
  isExpired?: boolean;
  companyName?: string;
  company?: { name?: string };
  title?: string;
  designation?: string;
  location?: string;
  jdURL?: string;
  seoData?: {
    canonicalUrl?: { url?: string };
    seoTimestamp?: string;
  };
  compensation?: {
    latestPostedDate?: string | number;
  };
  other?: {
    postedDate?: string | number;
    keywords?: string | readonly string[];
  };
  latestPostedDate?: string | number;
  postedDate?: string;
  desiredCandidate?: {
    experience?: { min?: string | number; max?: string | number };
    profile?: string;
  };
  experience?: { min?: string | number; max?: string | number };
  experienceText?: string;
  description?: string;
  keywords?: string | readonly string[];
  employmentType?: string;
  locationType?: string;
}

function parseFetchDetails(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return DEFAULT_FETCH_DETAILS;
}

function toAbsoluteUrl(rawUrl: string | undefined, jobId: string): string {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return `${NAUKRIGULF_BASE_URL}/job-listings-${jobId}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `${NAUKRIGULF_BASE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function parseUnixEpochSeconds(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!/^\d{9,11}$/.test(trimmed)) return null;
  return toIsoFromUnixSeconds(Number(trimmed));
}

function parsePostedAt(entry: NaukriGulfJobEntry): string | null {
  const epochIso =
    parseUnixEpochSeconds(entry.compensation?.latestPostedDate) ??
    parseUnixEpochSeconds(entry.other?.postedDate) ??
    parseUnixEpochSeconds(entry.latestPostedDate);
  if (epochIso) return epochIso;

  const dateCandidate = entry.postedDate ?? entry.seoData?.seoTimestamp;
  if (typeof dateCandidate === "string") {
    const trimmed = dateCandidate.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/, "$1T$2Z");
    return toIsoOrNull(normalized);
  }
  return toIsoOrNull(dateCandidate ?? null);
}

function parseMinYearsValue(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
  }
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match?.[1]) {
      const parsed = Number.parseInt(match[1], 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
  }
  return null;
}

function extractMinYears(entry: NaukriGulfJobEntry): number | null {
  return (
    parseMinYearsValue(entry.desiredCandidate?.experience?.min) ??
    parseMinYearsValue(entry.experience?.min) ??
    parseMinYearsValue(entry.experienceText)
  );
}

function formatKeywords(raw: string | readonly string[] | undefined): string {
  if (typeof raw === "string") {
    return normalizeWhitespace(raw);
  }
  if (Array.isArray(raw)) {
    return normalizeWhitespace(raw.filter((item): item is string => typeof item === "string").join(", "));
  }
  return "";
}

function buildDescription(entry: NaukriGulfJobEntry): string {
  const parts: string[] = [];

  const mainDescription = stripHtml(entry.description ?? "");
  if (mainDescription) {
    parts.push(mainDescription);
  }

  const candidateProfile = entry.desiredCandidate?.profile ? stripHtml(entry.desiredCandidate.profile) : "";
  if (candidateProfile) {
    parts.push(`Candidate Profile: ${candidateProfile}`);
  }

  const skills = formatKeywords(entry.other?.keywords) || formatKeywords(entry.keywords);
  if (skills) {
    parts.push(`Skills: ${skills}`);
  }

  const workModeParts = [entry.employmentType, entry.locationType]
    .map((part) => (typeof part === "string" ? normalizeWhitespace(part) : ""))
    .filter(Boolean);
  if (workModeParts.length > 0) {
    parts.push(`Work Mode: ${workModeParts.join(" / ")}`);
  }

  return parts.join("\n");
}

function toRawJob(item: unknown): RawJob | null {
  if (!item || typeof item !== "object") return null;
  const entry = item as NaukriGulfJobEntry;

  if (entry.isExpired === true) return null;
  if (entry.jobId === undefined || entry.jobId === null) return null;

  const sourceJobId = String(entry.jobId).trim();
  if (!sourceJobId) return null;

  const companyName = normalizeWhitespace((entry.companyName?.trim() ? entry.companyName : entry.company?.name) ?? "");
  const title = normalizeWhitespace((entry.title?.trim() ? entry.title : entry.designation) ?? "");
  const locationRaw = normalizeWhitespace(typeof entry.location === "string" ? entry.location : "");
  const url = toAbsoluteUrl(entry.jdURL?.trim() || entry.seoData?.canonicalUrl?.url?.trim(), sourceJobId);

  return {
    source: "naukrigulf",
    sourceJobId,
    companyId: null,
    companyName,
    title,
    locationRaw,
    description: buildDescription(entry),
    url,
    postedAt: parsePostedAt(entry),
    minYears: extractMinYears(entry),
  };
}

/** Creates an Apify-backed NaukriGulf scraper with injectable fetch, env, and clock dependencies. */
export function createNaukriGulfScraper(deps: NaukriGulfScraperDeps = {}): JobSourceScraper {
  const fetchFn = deps.fetchFn;
  const env = deps.env ?? process.env;
  const nowFn = deps.nowFn ?? (() => new Date());

  return {
    source: "naukrigulf",
    requiresCompanyConfig: false,

    shouldSkip(now?: Date): string | null {
      return getWorkweekSkipReason("naukrigulf", now ?? nowFn(), env);
    },

    async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
      const keywords = parseKeywordList(env.NAUKRIGULF_KEYWORDS, DEFAULT_KEYWORDS);
      const perRun = parsePositiveInt(env.NAUKRIGULF_KEYWORDS_PER_RUN, DEFAULT_KEYWORDS_PER_RUN);
      const selected = selectRotatedKeywords(keywords, perRun, nowFn());
      const maxJobs = parsePositiveInt(env.NAUKRIGULF_MAX_JOBS, DEFAULT_MAX_JOBS);
      const experience = env.NAUKRIGULF_EXPERIENCE?.trim() || DEFAULT_EXPERIENCE;
      const freshness = env.NAUKRIGULF_FRESHNESS?.trim() || DEFAULT_FRESHNESS;
      const fetchDetails = parseFetchDetails(env.NAUKRIGULF_FETCH_DETAILS);

      const rawJobs: RawJob[] = [];
      for (const keyword of selected) {
        const items = await runApifyNaukriActor(
          {
            jobBoard: "naukrigulf",
            keyword,
            maxJobs,
            experience,
            freshness,
            fetchDetails,
          },
          { env, fetchFn },
        );

        for (const item of items) {
          const mapped = toRawJob(item);
          if (mapped) {
            rawJobs.push(mapped);
          }
        }
      }

      const deduped = dedupeByCompanyAndTitle(rawJobs);
      return hasRoleFilter(roles) ? deduped.filter((job) => jobMatchesRoles(job, roles)) : deduped;
    },
  };
}

export const naukriGulfScraper: JobSourceScraper = createNaukriGulfScraper();
