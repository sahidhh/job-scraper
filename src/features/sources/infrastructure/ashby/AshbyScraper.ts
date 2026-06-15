import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";
import { delay, PER_COMPANY_DELAY_MS } from "../rateLimit";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  descriptionHtml?: string;
  applyUrl: string;
  publishedAt?: string;
}

interface AshbyBoardResponse {
  jobs: AshbyJob[];
}

function boardUrl(boardToken: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${boardToken}`;
}

function toRawJob(job: AshbyJob, company: Company): RawJob {
  return {
    source: "ashby",
    sourceJobId: job.id,
    companyId: company.id,
    companyName: company.name,
    title: normalizeWhitespace(job.title),
    locationRaw: normalizeWhitespace(job.location ?? ""),
    description: stripHtml(job.descriptionHtml ?? ""),
    url: job.applyUrl,
    postedAt: toIsoOrNull(job.publishedAt ?? null),
  };
}

async function fetchCompanyJobs(company: Company): Promise<RawJob[]> {
  if (!company.boardToken) {
    return [];
  }

  const response = await fetchWithRetry(boardUrl(company.boardToken));
  if (!response.ok) {
    throw new Error(`Ashby board "${company.boardToken}" returned ${response.status}`);
  }

  const body = (await response.json()) as AshbyBoardResponse;
  return body.jobs.map((job) => toRawJob(job, company));
}

export const ashbyScraper: JobSourceScraper = {
  source: "ashby",
  requiresCompanyConfig: true,

  // Ashby's public Job Board API (scrapers.md §1) has no role/keyword query
  // parameter -- fetch each company's full board, then filter client-side
  // via the shared `jobMatchesRoles` helper.
  async fetchJobs(companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const results: RawJob[] = [];

    for (const company of companies) {
      try {
        results.push(...(await fetchCompanyJobs(company)));
      } catch (error) {
        console.warn(`[ashby] ${company.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await delay(PER_COMPANY_DELAY_MS);
    }

    return results.filter((job) => jobMatchesRoles(job, roles));
  },
};
