// Pure TS mirrors of the Postgres enums (supabase/migrations/20260612000001_enums.sql).
// Domain code must depend on these, never on generated Supabase types.

export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "wellfound"
  | "remoteok"
  | "mycareersfuture"
  | "jsearch"
  | "adzuna"
  | "careers_url";

// The set of sources with an *expected regular cadence* -- iterated by
// getSourceHealthReport (source-health tracking, staleness detection) and
// used to validate NotificationPreferences.sources. jsearch/adzuna run on
// the normal scrape.ts cron loop (registry.ts) like every other feed-based
// source, so they belong here. `careers_url` deliberately does NOT (merge-
// workspace Phase 5, docs/decisions.md AD-35): it's a manual-trigger-only
// source (scripts/scrape-careers-url.ts, not in sourceScrapers/registry.ts)
// with no expected run cadence, so including it here would make every
// source-health check flag it `isStale` forever after its first-ever run.
export const JOB_SOURCES: readonly JobSource[] = [
  "greenhouse",
  "lever",
  "ashby",
  "wellfound",
  "remoteok",
  "mycareersfuture",
  "jsearch",
  "adzuna",
];

export type LocationTag = "india" | "singapore" | "uae" | "remote";

export const LOCATION_TAGS: readonly LocationTag[] = [
  "india",
  "singapore",
  "uae",
  "remote",
];

export type RoleMapSource = "seed" | "ai";

export type ScrapeRunStatus = "success" | "partial" | "failed";

// Sources that require a per-company board_token (companies.board_token).
// RemoteOK and Wellfound are feed-based and never set one (scrapers.md §1).
export const SOURCES_REQUIRING_BOARD_TOKEN: readonly JobSource[] = [
  "greenhouse",
  "lever",
  "ashby",
];
