import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

const REMOTEOK_API_URL = "https://remoteok.com/api";
const REMOTEOK_DISABLED_VAR = "REMOTEOK_DISABLED";

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

  // RemoteOK's single global feed (scrapers.md §1) has no role/keyword
  // query parameter -- fetch the whole feed, then filter client-side via
  // the shared `jobMatchesRoles` helper.
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const disabled = optionalEnv(REMOTEOK_DISABLED_VAR, "");
    if (disabled === "true" || disabled === "1") {
      console.log("[remoteok] disabled via REMOTEOK_DISABLED env var");
      return [];
    }


    const response = await fetchWithRetry(REMOTEOK_API_URL, {
      headers: { "User-Agent": "job-intelligence-platform" },
    });
    if (!response.ok) {
      throw new Error(`RemoteOK API returned ${response.status}`);
    }

    const entries = (await response.json()) as RemoteOkEntry[];
    return entries
      .filter(isJobEntry)
      .map(toRawJob)
      .filter((job) => jobMatchesRoles(job, roles));
  },
};
