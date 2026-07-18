import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull, toRemoteLocationRaw } from "../normalize";

const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs";
const REMOTIVE_DISABLED_VAR = "REMOTIVE_DISABLED";

// Remotive's public feed. Its response envelope leads with two informational
// string entries ("00-warning", "0-legal-notice") -- we read only `jobs`.
// Remotive asks callers to fetch a few times a day at most and to keep the
// posting URL / "Remotive" attribution, which this adapter honours: one
// unauthenticated request per scrape run, storing the original `url` and
// `source: "remotive"` (scrapers.md §1, design/limitations.md §1.1a).
interface RemotiveEntry {
  id?: string | number;
  url?: string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  description?: string;
  publication_date?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveEntry[];
}

function isJobEntry(entry: RemotiveEntry): entry is RemotiveEntry & { id: string | number; title: string; url: string } {
  return entry.id !== undefined && typeof entry.title === "string" && typeof entry.url === "string";
}

function toRawJob(entry: RemotiveEntry & { id: string | number; title: string; url: string }): RawJob {
  return {
    source: "remotive",
    sourceJobId: String(entry.id),
    companyId: null,
    companyName: normalizeWhitespace(entry.company_name ?? ""),
    title: normalizeWhitespace(entry.title),
    locationRaw: toRemoteLocationRaw(entry.candidate_required_location),
    description: stripHtml(entry.description ?? ""),
    url: entry.url,
    postedAt: toIsoOrNull(entry.publication_date ?? null),
  };
}

export const remotiveScraper: JobSourceScraper = {
  source: "remotive",
  requiresCompanyConfig: false,

  // Remotive's `search` query param exists but its guidance is to fetch
  // sparingly, so we pull the whole feed once and filter client-side via the
  // shared `jobMatchesRoles` helper (same pattern as remoteok).
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const disabled = optionalEnv(REMOTIVE_DISABLED_VAR, "");
    if (disabled === "true" || disabled === "1") {
      console.log("[remotive] disabled via REMOTIVE_DISABLED env var");
      return [];
    }

    const response = await fetchWithRetry(REMOTIVE_API_URL, {
      headers: { "User-Agent": "job-intelligence-platform" },
    });
    if (!response.ok) {
      throw new Error(`Remotive API returned ${response.status}`);
    }

    const body = (await response.json()) as RemotiveResponse;
    const entries = Array.isArray(body.jobs) ? body.jobs : [];
    return entries
      .filter(isJobEntry)
      .map(toRawJob)
      .filter((job) => jobMatchesRoles(job, roles));
  },
};
