import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoFromUnixSeconds, toRemoteLocationRaw } from "../normalize";

const HIMALAYAS_API_URL = "https://himalayas.app/jobs/api";
const HIMALAYAS_DISABLED_VAR = "HIMALAYAS_DISABLED";
// Himalayas' API ignores the `search` param (verified: identical results with
// and without it) and its full corpus is ~90k rows, so we pull one bounded,
// most-recent page (offset 0) and filter client-side via `jobMatchesRoles` --
// same "fetch feed, filter locally" shape as remoteok. Only jobs within this
// window are considered per run; see design/limitations.md §1.1a.
const HIMALAYAS_PAGE_LIMIT = 1000;

interface HimalayasEntry {
  title?: string;
  companyName?: string;
  guid?: string;
  applicationLink?: string;
  description?: string;
  locationRestrictions?: string[];
  pubDate?: number;
}

interface HimalayasResponse {
  jobs?: HimalayasEntry[];
}

function isJobEntry(entry: HimalayasEntry): entry is HimalayasEntry & { title: string; guid: string } {
  return typeof entry.title === "string" && typeof entry.guid === "string" && entry.guid.length > 0;
}

function toRawJob(entry: HimalayasEntry & { title: string; guid: string }): RawJob {
  const restrictions = Array.isArray(entry.locationRestrictions) ? entry.locationRestrictions.join(", ") : "";
  return {
    source: "himalayas",
    // `guid` is Himalayas' stable per-posting URL -- use it as the dedup id.
    sourceJobId: entry.guid,
    companyId: null,
    companyName: normalizeWhitespace(entry.companyName ?? ""),
    title: normalizeWhitespace(entry.title),
    locationRaw: toRemoteLocationRaw(restrictions),
    description: stripHtml(entry.description ?? ""),
    url: entry.applicationLink ?? entry.guid,
    postedAt: toIsoFromUnixSeconds(entry.pubDate),
  };
}

export const himalayasScraper: JobSourceScraper = {
  source: "himalayas",
  requiresCompanyConfig: false,

  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const disabled = optionalEnv(HIMALAYAS_DISABLED_VAR, "");
    if (disabled === "true" || disabled === "1") {
      console.log("[himalayas] disabled via HIMALAYAS_DISABLED env var");
      return [];
    }

    const url = `${HIMALAYAS_API_URL}?limit=${HIMALAYAS_PAGE_LIMIT}&offset=0`;
    const response = await fetchWithRetry(url, {
      headers: { "User-Agent": "job-intelligence-platform" },
    });
    if (!response.ok) {
      throw new Error(`Himalayas API returned ${response.status}`);
    }

    const body = (await response.json()) as HimalayasResponse;
    const entries = Array.isArray(body.jobs) ? body.jobs : [];
    return entries
      .filter(isJobEntry)
      .map(toRawJob)
      .filter((job) => jobMatchesRoles(job, roles));
  },
};
