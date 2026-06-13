// Pure TS mirrors of the Postgres enums (supabase/migrations/20260612000001_enums.sql).
// Domain code must depend on these, never on generated Supabase types.

export type JobSource = "greenhouse" | "lever" | "ashby" | "wellfound" | "remoteok";

export const JOB_SOURCES: readonly JobSource[] = [
  "greenhouse",
  "lever",
  "ashby",
  "wellfound",
  "remoteok",
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
