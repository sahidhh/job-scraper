import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import type { RawJob } from "@/features/sources/domain/types";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

const REMOTEOK_API_URL = "https://remoteok.com/api";

// The first element of the response is a legal notice with no `id`/`position`
// -- filter to entries that look like actual job postings.
interface RemoteOkEntry {
  id?: string | number;
  company?: string;
  position?: string;
  location?: string;
  description?: string;
  url?: string;
  date?: string;
}

function isJobEntry(entry: RemoteOkEntry): entry is RemoteOkEntry & { id: string | number; position: string; url: string } {
  return entry.id !== undefined && typeof entry.position === "string" && typeof entry.url === "string";
}

function toRawJob(entry: RemoteOkEntry & { id: string | number; position: string; url: string }): RawJob {
  return {
    source: "remoteok",
    sourceJobId: String(entry.id),
    companyId: null,
    companyName: normalizeWhitespace(entry.company ?? ""),
    title: normalizeWhitespace(entry.position),
    locationRaw: normalizeWhitespace(entry.location ?? ""),
    description: stripHtml(entry.description ?? ""),
    url: entry.url,
    postedAt: toIsoOrNull(entry.date ?? null),
  };
}

export const remoteokScraper: JobSourceScraper = {
  source: "remoteok",
  requiresCompanyConfig: false,

  async fetchJobs(_companies: Company[]): Promise<RawJob[]> {
    const response = await fetchWithRetry(REMOTEOK_API_URL, {
      headers: { "User-Agent": "job-intelligence-platform" },
    });
    if (!response.ok) {
      throw new Error(`RemoteOK API returned ${response.status}`);
    }

    const entries = (await response.json()) as RemoteOkEntry[];
    return entries.filter(isJobEntry).map(toRawJob);
  },
};
