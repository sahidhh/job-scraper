import type { JobSource } from "@/shared/domain/enums";

export type SourceHealthStatus = "active" | "unhealthy" | "disabled";

// Mirrors the `companies` table (database.md §2).
export interface Company {
  id: string;
  name: string;
  source: JobSource;
  boardToken: string | null; // null for sources that don't use one (remoteok/wellfound)
  active: boolean;
  createdAt: string; // ISO 8601
  healthStatus: SourceHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface NewCompany {
  name: string;
  source: JobSource;
  boardToken: string | null;
  active?: boolean;
}

export type CompanyUpdate = Partial<NewCompany>;

export interface SourceHealthUpdate {
  healthStatus: SourceHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

// How a career_page_url was discovered (Phase 2 Task 8). "ats_board" is
// deterministic (zero ambiguity: the board IS the careers page); "domain_guess"
// is a best-effort heuristic for companies with no board_token (aggregator
// sources) and should always carry confidence 'low' or 'medium'.
export type CareerPageDiscoveryMethod = "ats_board" | "domain_guess";
export type CareerPageConfidence = "high" | "medium" | "low";

// Mirrors the `company_career_pages` table -- keyed by canonicalCompanyName
// (companies/domain/normalizeCompanyName.ts) rather than companies.id so it
// can hold an entry for companies with no `companies` row at all (any
// company name seen in jobs.company_name, regardless of source).
export interface CareerPage {
  id: string;
  canonicalCompanyName: string;
  careerPageUrl: string;
  websiteUrl: string | null;
  discoveryMethod: CareerPageDiscoveryMethod;
  confidence: CareerPageConfidence;
  discoveredAt: string;
}

export interface NewCareerPage {
  canonicalCompanyName: string;
  careerPageUrl: string;
  websiteUrl?: string | null;
  discoveryMethod: CareerPageDiscoveryMethod;
  confidence: CareerPageConfidence;
}
