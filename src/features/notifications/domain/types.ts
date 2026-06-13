import type { JobSource, LocationTag } from "@/shared/domain/enums";

// Mirrors the `notifications_log` table (database.md §2).
export interface NotificationLogEntry {
  id: string;
  jobId: string;
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
}
