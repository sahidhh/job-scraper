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
import { toIsoOrNull } from "../normalize";

const NAUKRI_JOB_BASE = "https://www.naukri.com";

export const DEFAULT_KEYWORDS = [
  ".NET Developer",
  "Full Stack .NET Developer",
  "Full Stack Developer",
  "AI Full Stack Developer",
] as const;
export const DEFAULT_KEYWORDS_PER_RUN = 2;
export const DEFAULT_MAX_JOBS = 50;
export const DEFAULT_EXPERIENCE = "2";
export const DEFAULT_FRESHNESS = "3";

export interface ApifyNaukriItem {
  jobId?: string | number;
  title?: string;
  companyName?: string;
  location?: string;
  jdURL?: string;
  createdDate?: string | number;
  minimumExperience?: string | number;
  experience?: string | number;
  experienceText?: string;
  salary?: string;
  tagsAndSkills?: string | string[];
  jobDescription?: string;
}

export interface NaukriScraperDeps {
  fetchFn?: typeof fetch;
  env?: ScraperEnv;
  nowFn?: () => Date;
}

function formatLocationRaw(location: unknown): string {
  const loc = normalizeWhitespace(typeof location === "string" ? location : "");
  if (!loc) return "India";
  return /\b(india|remote)\b/i.test(loc) ? loc : `${loc}, India`;
}

function buildDescription(entry: ApifyNaukriItem): string {
  const parts: string[] = [];
  const body = stripHtml(typeof entry.jobDescription === "string" ? entry.jobDescription : "");
  if (body) {
    parts.push(body);
  }

  const rawTags = Array.isArray(entry.tagsAndSkills)
    ? entry.tagsAndSkills.join(", ")
    : typeof entry.tagsAndSkills === "string"
      ? entry.tagsAndSkills
      : "";
  const tags = normalizeWhitespace(rawTags);
  if (tags) {
    parts.push(`Skills: ${tags}`);
  }

  const salary = normalizeWhitespace(typeof entry.salary === "string" ? entry.salary : "");
  if (salary && !/not disclosed/i.test(salary)) {
    parts.push(`Salary: ${salary}`);
  }

  return parts.join("\n");
}

function toAbsoluteUrl(jdURL: unknown, jobId: string): string {
  const trimmed = typeof jdURL === "string" ? jdURL.trim() : "";
  if (!trimmed) return `${NAUKRI_JOB_BASE}/job-listings-${jobId}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `${NAUKRI_JOB_BASE}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function parsePostedAt(createdDate: unknown): string | null {
  if (typeof createdDate === "number") {
    return Number.isFinite(createdDate) ? toIsoOrNull(createdDate) : null;
  }
  if (typeof createdDate !== "string") return null;
  const trimmed = createdDate.trim();
  if (!trimmed) return null;

  // Naukri's Apify output returns IST timestamps like "2026-11-23 10:48:28" without an offset.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return toIsoOrNull(`${trimmed.replace(" ", "T")}+05:30`);
  }
  return toIsoOrNull(trimmed);
}

function extractMinYears(entry: ApifyNaukriItem): number | null {
  if (typeof entry.minimumExperience === "number" && Number.isFinite(entry.minimumExperience)) {
    return entry.minimumExperience;
  }
  if (typeof entry.minimumExperience === "string" && entry.minimumExperience.trim()) {
    const parsed = Number.parseInt(entry.minimumExperience.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof entry.experience === "number" && Number.isFinite(entry.experience)) {
    return entry.experience;
  }

  const expText =
    (typeof entry.experience === "string" ? entry.experience : "") ||
    (typeof entry.experienceText === "string" ? entry.experienceText : "");
  const match = expText.match(/(\d+)/);
  if (match?.[1]) {
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRawJob(item: unknown): RawJob | null {
  if (!item || typeof item !== "object") return null;
  const entry = item as ApifyNaukriItem;

  if (entry.jobId === undefined || entry.jobId === null) return null;
  const sourceJobId = String(entry.jobId).trim();
  if (!sourceJobId) return null;

  return {
    source: "naukri",
    sourceJobId,
    companyId: null,
    companyName: normalizeWhitespace(typeof entry.companyName === "string" ? entry.companyName : ""),
    title: normalizeWhitespace(typeof entry.title === "string" ? entry.title : ""),
    locationRaw: formatLocationRaw(entry.location),
    description: buildDescription(entry),
    url: toAbsoluteUrl(entry.jdURL, sourceJobId),
    postedAt: parsePostedAt(entry.createdDate),
    minYears: extractMinYears(entry),
  };
}

/** Creates an Apify-backed Naukri India scraper with keyword rotation and workweek gating. */
export function createNaukriScraper(deps: NaukriScraperDeps = {}): JobSourceScraper {
  const fetchFn = deps.fetchFn ?? fetch;
  const env = deps.env ?? process.env;
  const nowFn = deps.nowFn ?? (() => new Date());

  return {
    source: "naukri",
    requiresCompanyConfig: false,

    shouldSkip(now?: Date): string | null {
      return getWorkweekSkipReason("naukri", now ?? nowFn(), env);
    },

    async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
      const keywords = parseKeywordList(env.NAUKRI_KEYWORDS, DEFAULT_KEYWORDS);
      const perRun = parsePositiveInt(env.NAUKRI_KEYWORDS_PER_RUN, DEFAULT_KEYWORDS_PER_RUN);
      const selected = selectRotatedKeywords(keywords, perRun, nowFn());
      const maxJobs = parsePositiveInt(env.NAUKRI_MAX_JOBS, DEFAULT_MAX_JOBS);
      const experience = env.NAUKRI_EXPERIENCE?.trim() || DEFAULT_EXPERIENCE;
      const freshness = env.NAUKRI_FRESHNESS?.trim() || DEFAULT_FRESHNESS;

      const rawJobs: RawJob[] = [];
      for (const keyword of selected) {
        const items = await runApifyNaukriActor(
          {
            jobBoard: "naukri",
            keyword,
            maxJobs,
            experience,
            freshness,
            fetchDetails: false,
            walkin: false,
          },
          { env, fetchFn },
        );

        for (const item of items) {
          const raw = toRawJob(item);
          if (raw) {
            rawJobs.push(raw);
          }
        }
      }

      const deduped = dedupeByCompanyAndTitle(rawJobs);
      return hasRoleFilter(roles) ? deduped.filter((job) => jobMatchesRoles(job, roles)) : deduped;
    },
  };
}

export const naukriScraper: JobSourceScraper = createNaukriScraper();
