import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import type { RawJob } from "@/features/sources/domain/types";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";
import { delay, PER_COMPANY_DELAY_MS } from "../rateLimit";

interface LeverPosting {
  id: string;
  text: string;
  categories?: { location?: string };
  descriptionPlain?: string;
  description?: string;
  hostedUrl: string;
  createdAt?: number; // epoch ms
}

function postingsUrl(boardToken: string): string {
  return `https://api.lever.co/v0/postings/${boardToken}?mode=json`;
}

function toRawJob(posting: LeverPosting, company: Company): RawJob {
  const description = posting.descriptionPlain
    ? stripHtml(posting.descriptionPlain)
    : stripHtml(posting.description ?? "");

  return {
    source: "lever",
    sourceJobId: posting.id,
    companyId: company.id,
    companyName: company.name,
    title: normalizeWhitespace(posting.text),
    locationRaw: normalizeWhitespace(posting.categories?.location ?? ""),
    description,
    url: posting.hostedUrl,
    postedAt: toIsoOrNull(posting.createdAt ?? null),
  };
}

async function fetchCompanyJobs(company: Company): Promise<RawJob[]> {
  if (!company.boardToken) {
    return [];
  }

  const response = await fetchWithRetry(postingsUrl(company.boardToken));
  if (!response.ok) {
    throw new Error(`Lever board "${company.boardToken}" returned ${response.status}`);
  }

  const postings = (await response.json()) as LeverPosting[];
  return postings.map((posting) => toRawJob(posting, company));
}

export const leverScraper: JobSourceScraper = {
  source: "lever",
  requiresCompanyConfig: true,

  async fetchJobs(companies: Company[]): Promise<RawJob[]> {
    const results: RawJob[] = [];

    for (const company of companies) {
      try {
        results.push(...(await fetchCompanyJobs(company)));
      } catch (error) {
        console.warn(`[lever] ${company.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await delay(PER_COMPANY_DELAY_MS);
    }

    return results;
  },
};
