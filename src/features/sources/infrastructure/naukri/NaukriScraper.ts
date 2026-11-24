import type { Company } from "@/features/companies/domain/types";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { hasRoleFilter, jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { readSourceCookieHeader } from "../cookieStore";
import { toIsoOrNull } from "../normalize";

const NAUKRI_API_URL = "https://www.naukri.com/jobapi/v3/search";
const NAUKRI_JOB_BASE = "https://www.naukri.com";
const DEFAULT_MAX_PAGES = 3;
const MIN_JITTER_MS = 3000;
const MAX_JITTER_MS = 8000;
const DEFAULT_SEARCH_TERMS = [".NET", "C#", "Full Stack", "Software Engineer"];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface NaukriPlaceholder {
  type?: string;
  label?: string;
}

export interface NaukriJobEntry {
  jobId?: string | number;
  title?: string;
  companyName?: string;
  jdURL?: string;
  jobDescription?: string;
  createdDate?: string | number;
  experience?: string | number;
  minExp?: number;
  placeholders?: NaukriPlaceholder[];
  tagsAndSkills?: string;
}

interface NaukriSearchResponse {
  jobDetails?: NaukriJobEntry[];
  noOfJobs?: number;
}

export interface NaukriScraperDeps {
  fetchFn?: typeof fetch;
  readCookiesFn?: (env: NodeJS.ProcessEnv) => Promise<string>;
  delayFn?: (ms: number) => Promise<void>;
  randomFn?: () => number;
  env?: NodeJS.ProcessEnv;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMaxPages(env: NodeJS.ProcessEnv): number {
  const raw = env.NAUKRI_MAX_PAGES;
  if (!raw) return DEFAULT_MAX_PAGES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAGES;
}

function computeJitterMs(randomFn: () => number): number {
  const r = Math.min(Math.max(randomFn(), 0), 1);
  return Math.floor(MIN_JITTER_MS + r * (MAX_JITTER_MS - MIN_JITTER_MS));
}

function extractPlaceholder(placeholders: NaukriPlaceholder[] | undefined, type: string): string {
  if (!Array.isArray(placeholders)) return "";
  const match = placeholders.find((p) => p.type === type && typeof p.label === "string");
  return match?.label ? normalizeWhitespace(match.label) : "";
}

function extractMinYears(entry: NaukriJobEntry): number | null {
  if (typeof entry.minExp === "number" && Number.isFinite(entry.minExp)) {
    return entry.minExp;
  }
  if (typeof entry.experience === "number" && Number.isFinite(entry.experience)) {
    return entry.experience;
  }
  const expLabel =
    (typeof entry.experience === "string" ? entry.experience : "") ||
    extractPlaceholder(entry.placeholders, "experience");
  const match = expLabel.match(/(\d+)\s*[-–to]?\s*\d*\s*(?:yrs?|years?)/i) ?? expLabel.match(/^(\d+)/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toAbsoluteUrl(jdURL: string | undefined, jobId: string): string {
  if (!jdURL) return `${NAUKRI_JOB_BASE}/job-listings-${jobId}`;
  if (jdURL.startsWith("http://") || jdURL.startsWith("https://")) return jdURL;
  return `${NAUKRI_JOB_BASE}${jdURL.startsWith("/") ? "" : "/"}${jdURL}`;
}

function toRawJob(entry: NaukriJobEntry): RawJob | null {
  if (entry.jobId === undefined || entry.jobId === null) return null;
  const sourceJobId = String(entry.jobId).trim();
  if (!sourceJobId) return null;

  const locationRaw = extractPlaceholder(entry.placeholders, "location") || "India";
  const postedAt =
    typeof entry.createdDate === "number"
      ? toIsoOrNull(new Date(entry.createdDate).toISOString())
      : toIsoOrNull(entry.createdDate ?? null);

  return {
    source: "naukri",
    sourceJobId,
    companyId: null,
    companyName: normalizeWhitespace(entry.companyName ?? ""),
    title: normalizeWhitespace(entry.title ?? ""),
    locationRaw,
    description: stripHtml(entry.jobDescription ?? ""),
    url: toAbsoluteUrl(entry.jdURL, sourceJobId),
    postedAt,
    minYears: extractMinYears(entry),
  };
}

function buildSearchUrl(keyword: string, pageNo: number): string {
  const params = new URLSearchParams({
    noOfResults: "20",
    urlType: "search_by_keyword",
    searchType: "adv",
    keyword,
    experience: "2",
    location: "india,remote",
    pageNo: String(pageNo),
  });
  return `${NAUKRI_API_URL}?${params.toString()}`;
}

export function createNaukriScraper(deps: NaukriScraperDeps = {}): JobSourceScraper {
  const fetchFn = deps.fetchFn ?? fetch;
  const readCookiesFn = deps.readCookiesFn ?? ((env) => readSourceCookieHeader("naukri", env));
  const delayFn = deps.delayFn ?? defaultDelay;
  const randomFn = deps.randomFn ?? Math.random;
  const env = deps.env ?? process.env;

  return {
    source: "naukri",
    requiresCompanyConfig: false,

    async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
      const cookieHeader = await readCookiesFn(env);
      const maxPages = parseMaxPages(env);
      const terms = DEFAULT_SEARCH_TERMS;
      const seen = new Map<string, RawJob>();
      let requestsMade = 0;

      for (let i = 0; i < terms.length && requestsMade < maxPages; i++) {
        if (requestsMade > 0) {
          await delayFn(computeJitterMs(randomFn));
        }

        const term = terms[i];
        const url = buildSearchUrl(term, 1);
        requestsMade++;

        const response = await fetchFn(url, {
          redirect: "manual",
          headers: {
            appid: "109",
            systemid: "109",
            clientid: "d3skt0p",
            accept: "application/json",
            "User-Agent": USER_AGENT,
            Cookie: cookieHeader,
          },
        });

        if (response.status === 401) {
          throw new SourceAuthExpiredError("naukri", 401, "Naukri API returned 401 Unauthorized");
        }
        if (response.status === 403) {
          throw new SourceBlockedError("naukri", 403, "Naukri API returned 403 Forbidden");
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location") ?? "";
          throw new SourceAuthExpiredError(
            "naukri",
            response.status,
            `Naukri API redirected (${response.status})${location ? ` to ${location}` : ""}`,
          );
        }
        if (response.redirected && response.url.toLowerCase().includes("login")) {
          throw new SourceAuthExpiredError("naukri", response.status, `Redirected to login: ${response.url}`);
        }
        if (!response.ok) {
          throw new SourceBlockedError("naukri", response.status, `Naukri API returned ${response.status}`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
          throw new SourceAuthExpiredError("naukri", response.status, "Naukri API returned HTML instead of JSON");
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new SourceAuthExpiredError("naukri", response.status, "Naukri API returned non-JSON response");
        }

        const parsed = body as NaukriSearchResponse | null;
        const entries = Array.isArray(parsed?.jobDetails) ? parsed.jobDetails : [];
        if (entries.length === 0 && requestsMade === 1) {
          throw new SourceBlockedError(
            "naukri",
            response.status,
            `Naukri API returned unexpected 0-job payload for "${term}"`,
          );
        }

        for (const entry of entries) {
          const raw = toRawJob(entry);
          if (raw && !seen.has(raw.sourceJobId)) {
            seen.set(raw.sourceJobId, raw);
          }
        }
      }

      const jobs = Array.from(seen.values());
      return hasRoleFilter(roles) ? jobs.filter((job) => jobMatchesRoles(job, roles)) : jobs;
    },
  };
}

export const naukriScraper: JobSourceScraper = createNaukriScraper();
