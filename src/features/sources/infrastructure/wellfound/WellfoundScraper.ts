import type { Company } from "@/features/companies/domain/types";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import type { RawJob } from "@/features/sources/domain/types";
import { optionalEnv } from "@/shared/infrastructure/env";
import { fetchWithRetry } from "@/shared/infrastructure/http";
import { normalizeWhitespace, stripHtml } from "@/shared/infrastructure/text";
import { toIsoOrNull } from "../normalize";

// Wellfound has no documented public API (scrapers.md §1, decisions.md
// AD-10) -- the feed URL is a deploy-time config value. See docs/sources/wellfound.md
// for setup instructions and feed acquisition process.
const WELLFOUND_FEED_URL_VAR = "WELLFOUND_FEED_URL";
const WELLFOUND_DISABLED_VAR = "WELLFOUND_DISABLED";

// --- Config validation ---

export type WellfoundConfigStatus =
  | { status: "disabled" }
  | { status: "invalid_config"; reason: string }
  | { status: "ok"; feedUrl: string };

/**
 * Validates the Wellfound source configuration at startup.
 * Returns a discriminated union describing whether the source is disabled,
 * misconfigured, or ready to use.
 */
export function validateWellfoundConfig(): WellfoundConfigStatus {
  const disabled = optionalEnv(WELLFOUND_DISABLED_VAR, "");
  if (disabled === "true" || disabled === "1") {
    return { status: "disabled" };
  }

  const feedUrl = optionalEnv(WELLFOUND_FEED_URL_VAR, "");
  if (!feedUrl) {
    // Not configured — treat as disabled so unconfigured deployments don't
    // produce invalid_config noise. Set WELLFOUND_DISABLED=true to be explicit.
    return { status: "disabled" };
  }

  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    return { status: "invalid_config", reason: "malformed URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "invalid_config", reason: `unsupported protocol "${parsed.protocol}"` };
  }

  return { status: "ok", feedUrl };
}

// --- Feed parsing ---

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

// --- Scraper ---

export const wellfoundScraper: JobSourceScraper = {
  source: "wellfound",
  requiresCompanyConfig: false,

  // Wellfound's feed (scrapers.md §1, §5) has no role/keyword query
  // parameter -- fetch the whole feed, then filter client-side via the
  // shared `jobMatchesRoles` helper.
  async fetchJobs(_companies: Company[], roles: readonly string[]): Promise<RawJob[]> {
    const config = validateWellfoundConfig();

    if (config.status === "disabled") {
      console.log("[wellfound] disabled");
      return [];
    }

    if (config.status === "invalid_config") {
      console.warn(`[wellfound] invalid configuration: ${config.reason}`);
      return [];
    }

    const { feedUrl } = config;

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
