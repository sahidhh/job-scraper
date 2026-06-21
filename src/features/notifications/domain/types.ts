import type { JobSource, LocationTag } from "@/shared/domain/enums";

// Controls whether the cron sends one message per job (individual) or a
// single grouped digest (digest). Mirrors the NOTIFY_MODE env var.
export type NotifyMode = "individual" | "digest";

// Score thresholds for the MVP digest banding.
// Strong Match: aiScore >= STRONG_MATCH_THRESHOLD
// Worth Reviewing: notifyThreshold <= aiScore < STRONG_MATCH_THRESHOLD
export const STRONG_MATCH_THRESHOLD = 0.8;

// Maximum number of strong-match jobs shown in the digest message.
export const DIGEST_DISPLAY_LIMIT = 5;

// Mirrors the `notifications_log` table (database.md §2).
export interface NotificationLogEntry {
  id: string;
  jobId: string;
  sentAt: string; // ISO 8601
}

// Result of NotificationRepository.listRecent() -- a notifications_log
// row joined with the job it was sent for, for display in /settings.
export interface NotificationLogItem {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  source: JobSource;
  sentAt: string; // ISO 8601
}

// Result of NotificationRepository.findUnnotifiedMatches() -- the subset
// of a Job + JobScore needed to compose a Telegram message (scoring.md §4).
export interface JobMatch {
  jobId: string;
  title: string;
  companyName: string;
  locationTags: LocationTag[];
  source: JobSource;
  url: string;
  aiScore: number; // [0,1], guaranteed non-null by the query (scoring.md §4)
  aiReasoning: string | null;
  description: string;     // used for skill-based filtering
  minYears: number | null; // used for experience-based filtering
}

// One row per digest run — stores worth-reviewing job IDs for Telegram pagination.
export interface DigestSession {
  id: string;
  roleSelectionId: string;
  worthReviewingJobIds: string[];
  paginationMessageId: number | null;
  createdAt: string;
}

// Configurable include-only filters applied before Telegram delivery.
// All specified filters are ANDed; within each filter any match passes (OR).
// Absent or empty-array fields are skipped, preserving existing behaviour.
export interface NotificationPreferences {
  roles?: string[];          // title must contain at least one (case-insensitive)
  skills?: string[];         // description must match at least one skill from the dictionary
  locations?: LocationTag[]; // locationTags must include at least one
  minExperience?: number;    // min_years must be >= this (null min_years always passes)
  maxExperience?: number;    // min_years must be <= this (null min_years always passes)
  sources?: JobSource[];     // source must be in this list
}
