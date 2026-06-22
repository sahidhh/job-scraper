import type { JobSource, LocationTag } from "@/shared/domain/enums";

// Mirrors the `jobs` table (database.md §2).
export interface Job {
  id: string;
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
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  isActive: boolean;
  inactiveReason: string | null;
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
export interface JobWithScore extends Omit<Job, "description"> {
  keywordScore: number | null;
  aiScore: number | null;
  aiReasoning: string | null;
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

// Dataset-level scoring statistics for the dashboard stat line.
// Computed from job_scores directly, not from the paged findForDashboard result.
export interface JobStats {
  scoredCount: number;
  awaitingReviewCount: number;
  notEligibleCount: number;
  pendingCount: number; // awaitingReviewCount + notEligibleCount
  total: number;
}
