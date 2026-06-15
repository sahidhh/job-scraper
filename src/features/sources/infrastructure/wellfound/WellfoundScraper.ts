import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

// Wellfound has no documented public API (scrapers.md §1, decisions.md
// AD-10) -- the feed URL is a deploy-time config value. If unset, this
// source contributes zero jobs rather than guessing an endpoint.
const WELLFOUND_FEED_URL_VAR = "WELLFOUND_FEED_URL";

interface WellfoundEntry {
  id: string | number;
  title: string;
  company: string;
  url: string;
  location?: string;
  description?: string;
  postedAt?: string;
}

function isWellfoundEntry(entry: unknown): entry is WellfoundEntry {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const candidate = entry as Record<string, unknown>;
  return (
    (typeof candidate.id === "string" || typeof candidate.id === "number") &&
    typeof candidate.title === "string" &&
    typeof candidate.company === "string" &&
    typeof candidate.url === "string"
  );
}

function toRawJob(entry: WellfoundEntry): RawJob {
  return {
    source: "wellfound",
    sourceJobId: String(entry.id),
    companyId: null,
    companyName: normalizeWhitespace(entry.company),
    title: normalizeWhitespace(entry.title),
    locationRaw: normalizeWhitespace(entry.location ?? ""),
    description: stripHtml(entry.description ?? ""),
    url: entry.url,
    postedAt: toIsoOrNull(entry.postedAt ?? null),
  };
}

export const wellfoundScraper: JobSourceScraper = {
  source: "wellfound",
  requiresCompanyConfig: false,

  // Wellfound's feed (scrapers.md §1, §5) has no role/keyword query
  // parameter -- fetch the whole feed, then filter client-side via the
  // shared `jobMatchesRoles` helper.
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const feedUrl = optionalEnv(WELLFOUND_FEED_URL_VAR, "");
    if (!feedUrl) {
      console.warn(`[wellfound] ${WELLFOUND_FEED_URL_VAR} not configured; skipping`);
      return [];
    }

    try {
      const response = await fetchWithRetry(feedUrl);
      if (!response.ok) {
        console.warn(`[wellfound] feed returned ${response.status}`);
        return [];
      }

      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        console.warn("[wellfound] unexpected response shape (expected an array)");
        return [];
      }

      return body
        .filter(isWellfoundEntry)
        .map(toRawJob)
        .filter((job) => jobMatchesRoles(job, roles));
    } catch (error) {
      console.warn(`[wellfound] ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  },
};
