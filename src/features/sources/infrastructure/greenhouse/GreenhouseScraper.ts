import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";
import { delay, PER_COMPANY_DELAY_MS } from "../rateLimit";

interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  content?: string;
  absolute_url: string;
  updated_at?: string;
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseJob[];
}

function boardUrl(boardToken: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
}

function toRawJob(job: GreenhouseJob, company: Company): RawJob {
  return {
    source: "greenhouse",
    sourceJobId: String(job.id),
    companyId: company.id,
    companyName: company.name,
    title: normalizeWhitespace(job.title),
    locationRaw: normalizeWhitespace(job.location?.name ?? ""),
    description: stripHtml(job.content ?? ""),
    url: job.absolute_url,
    postedAt: toIsoOrNull(job.updated_at ?? null),
  };
}

async function fetchCompanyJobs(company: Company): Promise<RawJob[]> {
  if (!company.boardToken) {
    return [];
  }

  const response = await fetchWithRetry(boardUrl(company.boardToken));
  if (!response.ok) {
    throw new Error(`Greenhouse board "${company.boardToken}" returned ${response.status}`);
  }

  const body = (await response.json()) as GreenhouseBoardResponse;
  return body.jobs.map((job) => toRawJob(job, company));
}

export const greenhouseScraper: JobSourceScraper = {
  source: "greenhouse",
  requiresCompanyConfig: true,

  // Greenhouse's public board API (scrapers.md §1) has no role/keyword
  // query parameter -- fetch each company's full board, then filter
  // client-side via the shared `jobMatchesRoles` helper.
  async fetchJobs(companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const results: RawJob[] = [];

    for (const company of companies) {
      try {
        results.push(...(await fetchCompanyJobs(company)));
      } catch (error) {
        console.warn(`[greenhouse] ${company.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await delay(PER_COMPANY_DELAY_MS);
    }

    return results.filter((job) => jobMatchesRoles(job, roles));
  },
};
