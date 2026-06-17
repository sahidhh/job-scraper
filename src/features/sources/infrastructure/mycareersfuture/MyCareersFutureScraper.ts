import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { hasRoleFilter, jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

// MyCareersFuture.gov.sg public REST API (no auth required).
// Unlike other adapters, this source supports server-side keyword search --
// we issue one request per search term rather than fetching the full feed.
const MCF_API_BASE = "https://api.mycareersfuture.gov.sg/v2/jobs";
const MCF_JOB_BASE = "https://www.mycareersfuture.gov.sg/job";
const PAGE_SIZE = 100;

// Max parallel searches to avoid hammering the API when roles list is long.
const MAX_SEARCH_TERMS = 4;

// Fallback search terms when no role filter is active.
const DEFAULT_SEARCH_TERMS = ["software engineer", "developer"];

interface MCFCompany {
  name: string;
}

interface MCFMetadata {
  createdAt?: string;
}

interface MCFJob {
  uuid: string;
  title?: string;
  company?: MCFCompany;
  metadata?: MCFMetadata;
  description?: string;
  externalJobUrl?: string;
}

interface MCFResponse {
  total?: number;
  results?: MCFJob[];
}

function isMCFResponse(body: unknown): body is MCFResponse {
  return typeof body === "object" && body !== null;
}

function toRawJob(entry: MCFJob): RawJob {
  return {
    source: "mycareersfuture",
    sourceJobId: entry.uuid,
    companyId: null,
    companyName: normalizeWhitespace(entry.company?.name ?? ""),
    title: normalizeWhitespace(entry.title ?? ""),
    locationRaw: "Singapore",
    description: stripHtml(entry.description ?? ""),
    url: entry.externalJobUrl ?? `${MCF_JOB_BASE}/${entry.uuid}`,
    postedAt: toIsoOrNull(entry.metadata?.createdAt ?? null),
  };
}

async function fetchByTerm(term: string): Promise<MCFJob[]> {
  const url = `${MCF_API_BASE}?search=${encodeURIComponent(term)}&limit=${PAGE_SIZE}&page=0`;
  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": "job-intelligence-platform" },
  });
  if (!response.ok) {
    throw new Error(`MyCareersFuture API returned ${response.status} for "${term}"`);
  }
  const body: unknown = await response.json();
  if (!isMCFResponse(body) || !Array.isArray(body.results)) {
    return [];
  }
  return body.results.filter((r): r is MCFJob => typeof r === "object" && r !== null && typeof r.uuid === "string");
}

export const myCareersFutureScraper: JobSourceScraper = {
  source: "mycareersfuture",
  requiresCompanyConfig: false,

  // MCF exposes a keyword search API, so we issue one request per term
  // instead of fetching the whole feed (the feed covers all of Singapore's
  // job market and would be impractically large). Up to MAX_SEARCH_TERMS
  // queries run in parallel; results are deduped by uuid before being
  // filtered client-side by jobMatchesRoles for consistency with other adapters.
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const searchTerms = hasRoleFilter(roles)
      ? [...new Set(roles.map((r) => r.trim()).filter(Boolean))].slice(0, MAX_SEARCH_TERMS)
      : DEFAULT_SEARCH_TERMS;

    const results = await Promise.all(searchTerms.map(fetchByTerm));

    const seen = new Set<string>();
    const deduped: MCFJob[] = [];
    for (const batch of results) {
      for (const job of batch) {
        if (!seen.has(job.uuid)) {
          seen.add(job.uuid);
          deduped.push(job);
        }
      }
    }

    return deduped
      .map(toRawJob)
      .filter((job) => jobMatchesRoles(job, roles));
  },
};
