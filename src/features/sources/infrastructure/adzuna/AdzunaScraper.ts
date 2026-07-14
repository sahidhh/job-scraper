import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { hasRoleFilter, jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

const ADZUNA_API_BASE = "https://api.adzuna.com/v1/api/jobs";

const ADZUNA_APP_ID_VAR = "ADZUNA_APP_ID";
const ADZUNA_APP_KEY_VAR = "ADZUNA_APP_KEY";
const ADZUNA_DISABLED_VAR = "ADZUNA_DISABLED";
const ADZUNA_COUNTRIES_VAR = "ADZUNA_COUNTRIES";

const MAX_SEARCH_TERMS = 2;
const DEFAULT_SEARCH_TERMS = ["software engineer", "backend developer"];
// Adzuna's covered-country list does not include the UAE (design/limitations.md
// -- documented, not a bug): only "in"/"sg" of this platform's three target
// regions are reachable through Adzuna. UAE coverage still comes from
// jsearch/the ATS adapters.
const DEFAULT_COUNTRIES = ["in", "sg"];
const RESULTS_PER_PAGE = "20";

export type AdzunaConfigStatus = { status: "disabled" } | { status: "ok"; appId: string; appKey: string; countries: string[] };

export function validateAdzunaConfig(): AdzunaConfigStatus {
  const disabled = optionalEnv(ADZUNA_DISABLED_VAR, "");
  if (disabled === "true" || disabled === "1") {
    return { status: "disabled" };
  }

  const appId = optionalEnv(ADZUNA_APP_ID_VAR, "");
  const appKey = optionalEnv(ADZUNA_APP_KEY_VAR, "");
  if (!appId || !appKey) {
    // Not configured -- treat as disabled so unconfigured deployments don't
    // produce noise (same "unconfigured = clean skip" convention as
    // WellfoundScraper.validateWellfoundConfig).
    return { status: "disabled" };
  }

  const countries = optionalEnv(ADZUNA_COUNTRIES_VAR, DEFAULT_COUNTRIES.join(","))
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  return { status: "ok", appId, appKey, countries: countries.length > 0 ? countries : DEFAULT_COUNTRIES };
}

interface AdzunaJob {
  id?: string | number;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url?: string;
  created?: string;
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

function isAdzunaResponse(body: unknown): body is AdzunaResponse {
  return typeof body === "object" && body !== null;
}

// Same stable-ID discipline as jsearch's fix for jobhunt bug #4: only accept
// entries with a genuine id and a real redirect (apply) URL -- never
// synthesize sourceJobId from something that could change across identical
// re-fetches of the same posting.
function isJobEntry(job: AdzunaJob): job is AdzunaJob & { id: string | number; title: string; redirect_url: string } {
  return (
    (typeof job.id === "string" || typeof job.id === "number") &&
    typeof job.title === "string" &&
    job.title.length > 0 &&
    typeof job.redirect_url === "string" &&
    job.redirect_url.length > 0
  );
}

function toRawJob(job: AdzunaJob & { id: string | number; title: string; redirect_url: string }): RawJob {
  return {
    source: "adzuna",
    sourceJobId: String(job.id),
    companyId: null,
    companyName: normalizeWhitespace(job.company?.display_name ?? ""),
    title: normalizeWhitespace(job.title),
    locationRaw: normalizeWhitespace(job.location?.display_name ?? ""),
    description: stripHtml(job.description ?? ""),
    url: job.redirect_url,
    postedAt: toIsoOrNull(job.created ?? null),
  };
}

async function fetchByTermAndCountry(term: string, country: string, appId: string, appKey: string): Promise<AdzunaJob[]> {
  const url =
    `${ADZUNA_API_BASE}/${encodeURIComponent(country)}/search/1` +
    `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&what=${encodeURIComponent(term)}&results_per_page=${RESULTS_PER_PAGE}&content-type=application/json`;

  const response = await fetchWithRetry(url);
  if (!response.ok) {
    console.warn(`[adzuna] API returned ${response.status} for what="${term}" country=${country}`);
    return [];
  }
  const body: unknown = await response.json();
  if (!isAdzunaResponse(body) || !Array.isArray(body.results)) {
    return [];
  }
  return body.results;
}

export const adzunaScraper: JobSourceScraper = {
  source: "adzuna",
  requiresCompanyConfig: false,

  // Adzuna has a real keyword/country search API -- one request per
  // (search term x target country) combo, bounded by MAX_SEARCH_TERMS, same
  // shape as jsearch/MyCareersFuture.
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const config = validateAdzunaConfig();
    if (config.status === "disabled") {
      console.log("[adzuna] disabled");
      return [];
    }

    const searchTerms = hasRoleFilter(roles)
      ? [...new Set(roles.map((r) => r.trim()).filter(Boolean))].slice(0, MAX_SEARCH_TERMS)
      : DEFAULT_SEARCH_TERMS;

    const combos = searchTerms.flatMap((term) => config.countries.map((country) => ({ term, country })));

    const results = await Promise.all(
      combos.map(({ term, country }) => fetchByTermAndCountry(term, country, config.appId, config.appKey)),
    );

    const seen = new Set<string>();
    const deduped: (AdzunaJob & { id: string | number; title: string; redirect_url: string })[] = [];
    for (const batch of results) {
      for (const job of batch) {
        if (isJobEntry(job)) {
          const key = String(job.id);
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(job);
          }
        }
      }
    }

    return deduped.map(toRawJob).filter((job) => jobMatchesRoles(job, roles));
  },
};
