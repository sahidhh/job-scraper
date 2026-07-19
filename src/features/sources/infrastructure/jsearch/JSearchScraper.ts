import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { hasRoleFilter, jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

// JSearch (RapidAPI) indexes Google for Jobs, which surfaces LinkedIn/Indeed/
// Glassdoor/company listings through one legal aggregator API -- not direct
// scraping of those sites (design/scope.md §4 "Job board accounts" out-of-
// scope line is about scraping them ourselves; this is a licensed third-
// party API, the same distinction jobhunt/sources.py's own docstring draws).
const JSEARCH_URL = "https://jsearch.p.rapidapi.com/search";
const JSEARCH_HOST = "jsearch.p.rapidapi.com";

const RAPIDAPI_KEY_VAR = "RAPIDAPI_KEY";
const JSEARCH_DISABLED_VAR = "JSEARCH_DISABLED";
const JSEARCH_COUNTRIES_VAR = "JSEARCH_COUNTRIES";

// RapidAPI's JSearch free tier meters requests tightly (as low as a few
// hundred/month) -- keep worst-case requests-per-run small and deterministic
// rather than looping every expanded role. 2 terms x 3 countries = 6 calls/run.
const MAX_SEARCH_TERMS = 2;
const DEFAULT_SEARCH_TERMS = ["software engineer", "backend developer"];
const DEFAULT_COUNTRIES = ["in", "sg", "ae"];
const NUM_PAGES = "1";
// jobhunt/sources.py's own default -- a wide-but-bounded recency window;
// safe to overlap with the previous run since ingestJobs upserts on
// (source, source_job_id), same idempotency every ATS adapter already relies on.
const DATE_POSTED = "month";

export type JSearchConfigStatus = { status: "disabled" } | { status: "ok"; apiKey: string; countries: string[] };

export function validateJSearchConfig(): JSearchConfigStatus {
  const disabled = optionalEnv(JSEARCH_DISABLED_VAR, "");
  if (disabled === "true" || disabled === "1") {
    return { status: "disabled" };
  }

  const apiKey = optionalEnv(RAPIDAPI_KEY_VAR, "");
  if (!apiKey) {
    // Not configured -- treat as disabled so unconfigured deployments don't
    // produce noise (same "unconfigured = clean skip" convention as
    // WellfoundScraper.validateWellfoundConfig).
    return { status: "disabled" };
  }

  const countries = optionalEnv(JSEARCH_COUNTRIES_VAR, DEFAULT_COUNTRIES.join(","))
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  return { status: "ok", apiKey, countries: countries.length > 0 ? countries : DEFAULT_COUNTRIES };
}

interface JSearchJob {
  job_id?: string;
  job_apply_link?: string;
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_country?: string;
  job_description?: string;
  job_posted_at_datetime_utc?: string;
}

interface JSearchResponse {
  data?: JSearchJob[];
}

function isJSearchResponse(body: unknown): body is JSearchResponse {
  return typeof body === "object" && body !== null;
}

// jobhunt bug #4: jobhunt/sources.py's `_normalize_jsearch` falls back to
// `job_apply_link` as the job_id when JSearch omits one. Apply links can
// carry per-request redirect/tracking tokens that change across identical
// re-fetches of the same posting, so using one as `sourceJobId` (the
// (source, source_job_id) dedup/upsert key -- RawJob.sourceJobId's contract,
// domain/types.ts) would silently re-insert the same job as "new" on every
// run instead of updating it. Reject entries with no genuine job_id instead
// of substituting an unstable fallback.
function isJobEntry(job: JSearchJob): job is JSearchJob & { job_id: string; job_apply_link: string; job_title: string } {
  return (
    typeof job.job_id === "string" &&
    job.job_id.length > 0 &&
    typeof job.job_apply_link === "string" &&
    job.job_apply_link.length > 0 &&
    typeof job.job_title === "string" &&
    job.job_title.length > 0
  );
}

// JSearch returns `job_country` as a 2-letter ISO code ("IN"), which the
// location filter's keyword rules (india/singapore/uae in
// shared/config/location-keywords.ts) don't recognise -- a job whose city is
// also absent or outside the curated city list would be dropped by
// tagLocations despite being in a target country (observed live: 29 found, 0
// kept). Map the target codes to the full country name so the location tag
// always resolves. A code we don't recognise (e.g. a "US" remote job
// cross-listed into an AE search) is left as-is, so it's correctly filtered
// out as a non-target geography; an absent country falls back to the country
// we actually queried.
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  in: "India",
  sg: "Singapore",
  ae: "United Arab Emirates",
};

function resolveCountryName(jobCountry: string | undefined, queryCountry: string): string {
  const code = (jobCountry ?? "").trim().toLowerCase();
  if (code) {
    return COUNTRY_CODE_TO_NAME[code] ?? jobCountry ?? queryCountry;
  }
  return COUNTRY_CODE_TO_NAME[queryCountry] ?? queryCountry;
}

function toRawJob(
  job: JSearchJob & { job_id: string; job_apply_link: string; job_title: string },
  queryCountry: string,
): RawJob {
  const location = [job.job_city, resolveCountryName(job.job_country, queryCountry)]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  return {
    source: "jsearch",
    sourceJobId: job.job_id,
    companyId: null,
    companyName: normalizeWhitespace(job.employer_name ?? ""),
    title: normalizeWhitespace(job.job_title),
    locationRaw: normalizeWhitespace(location),
    description: stripHtml(job.job_description ?? ""),
    url: job.job_apply_link,
    postedAt: toIsoOrNull(job.job_posted_at_datetime_utc ?? null),
  };
}

async function fetchByTermAndCountry(term: string, country: string, apiKey: string): Promise<JSearchJob[]> {
  const url = `${JSEARCH_URL}?query=${encodeURIComponent(term)}&country=${encodeURIComponent(country)}&num_pages=${NUM_PAGES}&date_posted=${DATE_POSTED}`;
  const response = await fetchWithRetry(url, {
    headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": JSEARCH_HOST },
  });
  if (!response.ok) {
    console.warn(`[jsearch] API returned ${response.status} for query="${term}" country=${country}`);
    return [];
  }
  const body: unknown = await response.json();
  if (!isJSearchResponse(body) || !Array.isArray(body.data)) {
    return [];
  }
  return body.data;
}

export const jsearchScraper: JobSourceScraper = {
  source: "jsearch",
  requiresCompanyConfig: false,

  // JSearch has a real query/country search API (unlike the ATS boards) --
  // one request per (search term x target country) combo, bounded by
  // MAX_SEARCH_TERMS, same "issue N requests instead of one big feed"
  // shape as MyCareersFutureScraper.
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const config = validateJSearchConfig();
    if (config.status === "disabled") {
      console.log("[jsearch] disabled");
      return [];
    }

    const searchTerms = hasRoleFilter(roles)
      ? [...new Set(roles.map((r) => r.trim()).filter(Boolean))].slice(0, MAX_SEARCH_TERMS)
      : DEFAULT_SEARCH_TERMS;

    const combos = searchTerms.flatMap((term) => config.countries.map((country) => ({ term, country })));

    // Carry the queried country alongside each batch so toRawJob can resolve a
    // full country name (JSearch's job_country is a bare ISO code).
    const results = await Promise.all(
      combos.map(async ({ term, country }) => ({
        country,
        jobs: await fetchByTermAndCountry(term, country, config.apiKey),
      })),
    );

    const seen = new Set<string>();
    const deduped: RawJob[] = [];
    for (const { country, jobs } of results) {
      for (const job of jobs) {
        if (isJobEntry(job) && !seen.has(job.job_id)) {
          seen.add(job.job_id);
          deduped.push(toRawJob(job, country));
        }
      }
    }

    return deduped.filter((job) => jobMatchesRoles(job, roles));
  },
};
