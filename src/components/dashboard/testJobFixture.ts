import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";

// Shared fixtures for the dashboard component tests. Kept as a plain builder
// rather than a factory library so the tests stay readable when a field on
// JobWithScore changes.
export function makeJob(overrides: Partial<JobWithScore> = {}): JobWithScore {
  return {
    id: "job-1",
    source: "adzuna",
    sourceJobId: "src-1",
    companyId: null,
    companyName: "Acme",
    title: "Backend Engineer",
    locationRaw: "Remote",
    locationTags: [],
    url: "https://example.test/job-1",
    postedAt: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isActive: true,
    inactiveReason: null,
    ineligibleReason: null,
    keywordScore: null,
    aiScore: null,
    aiReasoning: null,
    overallScore: null,
    overallScoreReasons: null,
    retryCount: null,
    minYears: null,
    statusId: null,
    statusLabel: null,
    statusColor: null,
    manualScore: null,
    manualStandout: null,
    manualVerify: null,
    manualRequirements: null,
    ...overrides,
  };
}

export const TEST_STATUSES: JobStatus[] = [
  { id: "status-new", label: "New", color: "#888888", sortOrder: 0 },
  { id: "status-viewed", label: "Viewed", color: "#a855f7", sortOrder: 1 },
  { id: "status-applied", label: "Applied", color: "#22c55e", sortOrder: 2 },
  { id: "status-not-interested", label: "Not Interested", color: "#ff0000", sortOrder: 3 },
  { id: "status-archived", label: "Archived", color: "#333333", sortOrder: 4 },
];
