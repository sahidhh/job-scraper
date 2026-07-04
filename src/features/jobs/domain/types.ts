import type { JobSource, LocationTag } from "@/shared/domain/enums";

// Mirrors the `jobs` table (database.md §2).
export interface Job {
  id: string;
  source: JobSource;
  sourceJobId: string;
  companyId: string | null;
  companyName: string;
  // Deterministic normalization of companyName (legal suffix/regional
  // qualifier stripped, e.g. "Google LLC" -> "Google"). Computed at write
  // time by the repository -- see companies/domain/normalizeCompanyName.ts.
  canonicalCompanyName: string;
  title: string;
  locationRaw: string;
  locationTags: LocationTag[];
  description: string;
  url: string;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  isActive: boolean;
  inactiveReason: string | null;
  minYears: number | null;
  // Cross-source duplicate key (Phase 1 Task 1): sha256 of normalized
  // title + canonical company + sorted location tags. Computed at write
  // time -- see computeFingerprint.ts.
  fingerprint: string;
}

// Input to JobRepository.upsertMany() -- a TaggedRawJob ready to persist.
// No `id`/`firstSeenAt`/`updatedAt`: the repository sets these on insert
// and preserves firstSeenAt on conflict (repositories.md §2).
export interface NormalizedJob {
  source: JobSource;
  sourceJobId: string;
  companyId: string | null;
  companyName: string;
  title: string;
  locationRaw: string;
  locationTags: LocationTag[];
  description: string;
  url: string;
  postedAt: string | null;
  // Best-effort minimum years of experience parsed from the posting at
  // ingest (P2). Optional on input; derived by ingestJobs, not the scraper.
  minYears?: number | null;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  // Jobs skipped because their fingerprint matched an already-persisted job
  // from a different source -- recorded in job_duplicates instead of
  // inserted as a new row (Phase 1 Task 1).
  duplicates: number;
}

// A source rediscovery of an already-ingested logical job (job_duplicates
// table): the `jobs` row is never duplicated, this just preserves
// provenance for the other source(s) that also carry the same posting.
export interface JobDuplicate {
  canonicalJobId: string;
  source: JobSource;
  sourceJobId: string;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

// A user-assignable status (job_statuses table, P0). Seeded with mild
// colors; full CRUD deferred to a later phase.
export interface JobStatus {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
}

export interface CreateStatusInput {
  label: string;
  color: string;
}

export interface UpdateStatusInput {
  label?: string;
  color?: string;
}

// Dashboard query filters (repositories.md §2).
export interface JobFilters {
  locationTags?: LocationTag[];
  sources?: JobSource[];
  minAiScore?: number;
  // Restrict to jobs whose current status is one of these ids.
  statusIds?: string[];
  // Jobs whose status is "Archived" are hidden unless this is true.
  includeArchived?: boolean;
  // Keep jobs requiring at most this many years (P2, soft). Jobs with
  // min_years NULL ("unknown") always pass and are never excluded.
  maxYears?: number;
}

// Job joined with its score for the active role_selection. Omits
// `description` -- the dashboard query doesn't select it (P1 #4, never
// rendered by JobRow).
export interface JobWithScore extends Omit<Job, "description" | "fingerprint" | "canonicalCompanyName"> {
  keywordScore: number | null;
  aiScore: number | null;
  aiReasoning: string | null;
  minYears: number | null;
  // Current status (job_state join, P0). Null => unset, rendered as the
  // first seeded status (New) by the UI.
  statusId: string | null;
  statusLabel: string | null;
  statusColor: string | null;
}

// Result of findForDashboard: a limited page of jobs plus whether more rows
// exist beyond `limit` (repositories.md §2).
export interface JobsPage {
  jobs: JobWithScore[];
  hasMore: boolean;
}

// Dataset-level scoring stats for the active (role, resumeVersion) pair.
// Derived from job_scores counts across the full dataset, not from a page
// slice — prevents stats from changing as the user pages through results.
export interface JobStats {
  scoredCount: number;
  awaitingReviewCount: number;
  notEligibleCount: number;
  pendingCount: number; // awaitingReviewCount + notEligibleCount
  total: number;
}
