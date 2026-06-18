import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { Button } from "@/components/ui/button";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import type { JobFilters } from "@/features/jobs/domain/types";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import type { ScrapeRun } from "@/features/sources/domain/types";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import type { JobSource, LocationTag } from "@/shared/domain/enums";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

const DEFAULT_JOBS_LIMIT = 50;
const MAX_JOBS_LIMIT = 500;

type DashboardSearchParams = {
  location?: string;
  source?: string;
  minScore?: string;
  status?: string;
  archived?: string;
  maxYears?: string;
  limit?: string;
};

interface DashboardPageProps {
  searchParams: Promise<DashboardSearchParams>;
}

function parseFilters(params: DashboardSearchParams): JobFilters {
  const filters: JobFilters = {};

  if (params.location && (LOCATION_TAGS as readonly string[]).includes(params.location)) {
    filters.locationTags = [params.location as LocationTag];
  }
  if (params.source && (JOB_SOURCES as readonly string[]).includes(params.source)) {
    filters.sources = [params.source as JobSource];
  }
  if (params.minScore) {
    const value = Number(params.minScore);
    if (!Number.isNaN(value)) {
      filters.minAiScore = value;
    }
  }
  if (params.status) {
    filters.statusIds = [params.status];
  }
  if (params.archived === "1") {
    filters.includeArchived = true;
  }
  if (params.maxYears) {
    const value = Number(params.maxYears);
    if (Number.isInteger(value) && value >= 0) {
      filters.maxYears = value;
    }
  }

  return filters;
}

function parseLimit(params: DashboardSearchParams): number {
  const value = Number(params.limit);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_JOBS_LIMIT;
  return Math.min(Math.floor(value), MAX_JOBS_LIMIT);
}

function loadMoreHref(params: DashboardSearchParams, currentLimit: number): string {
  const next = new URLSearchParams();
  if (params.location) next.set("location", params.location);
  if (params.source) next.set("source", params.source);
  if (params.minScore) next.set("minScore", params.minScore);
  if (params.status) next.set("status", params.status);
  if (params.archived) next.set("archived", params.archived);
  if (params.maxYears) next.set("maxYears", params.maxYears);
  next.set("limit", String(currentLimit + DEFAULT_JOBS_LIMIT));
  return `/dashboard?${next.toString()}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const activeSelection = await roleRepository.getActiveSelection();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {activeSelection
            ? `Showing matches for "${activeSelection.primaryRole}".`
            : "Set up a role selection to see matching jobs."}
        </p>
      </div>

      {activeSelection ? (
        <DashboardContent
          roleSelectionId={activeSelection.id}
          primaryRole={activeSelection.primaryRole}
          expandedRoles={activeSelection.expandedRoles}
          filters={parseFilters(params)}
          params={params}
        />
      ) : (
        <Button asChild>
          <Link href="/roles">Choose a role</Link>
        </Button>
      )}
    </div>
  );
}

// Companies/scrape-run data doesn't depend on the jobs filters, so it's
// fetched here (outside the Suspense boundary below) and isn't re-resolved
// when only the filter-dependent JobsSection re-renders (P1 #2).
async function DashboardContent({
  roleSelectionId,
  primaryRole,
  expandedRoles,
  filters,
  params,
}: {
  roleSelectionId: string;
  primaryRole: string;
  expandedRoles: string[];
  filters: JobFilters;
  params: DashboardSearchParams;
}) {
  const client = await createSupabaseServerClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);

  const [companies, scrapeRuns] = await Promise.all([companyRepository.list(), scrapeRunRepository.listRecent(1)]);

  return (
    <div className="space-y-4">
      {companies.length === 0 && (
        <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          <p className="text-muted-foreground">
            No companies configured yet — add some in Settings so the scraper has somewhere to look.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href="/settings">Go to Settings &rarr;</Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<JobsSectionFallback />}>
        <JobsSection
          roleSelectionId={roleSelectionId}
          primaryRole={primaryRole}
          expandedRoles={expandedRoles}
          filters={filters}
          params={params}
          scrapeRuns={scrapeRuns}
        />
      </Suspense>
    </div>
  );
}

function JobsSectionFallback() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-72 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded-md border border-border bg-muted/50" />
    </div>
  );
}

async function JobsSection({
  roleSelectionId,
  primaryRole,
  expandedRoles,
  filters,
  params,
  scrapeRuns,
}: {
  roleSelectionId: string;
  primaryRole: string;
  expandedRoles: string[];
  filters: JobFilters;
  params: DashboardSearchParams;
  scrapeRuns: ScrapeRun[];
}) {
  const client = await createSupabaseServerClient();
  const jobRepository = new SupabaseJobRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);
  const limit = parseLimit(params);

  // Desired-experience setting is the default soft year cap; an explicit
  // maxYears search param overrides it for the current view (P2).
  const desiredExperience = await settingsRepository.getDesiredExperienceYears();
  const effectiveFilters: JobFilters =
    filters.maxYears === undefined && desiredExperience !== null
      ? { ...filters, maxYears: desiredExperience }
      : filters;

  const activeResume = await resumeRepository.getActive();
  // If no active resume, version 0 matches no scores (sentinel); jobs show as pending.
  const resumeVersion = activeResume?.version ?? 0;

  const [{ jobs, hasMore }, matchingRoleCount, statuses] = await Promise.all([
    jobRepository.findForDashboard(roleSelectionId, effectiveFilters, limit, resumeVersion),
    jobRepository.countMatchingExpandedRoles(expandedRoles),
    jobRepository.listStatuses(),
  ]);

  const scoredCount = jobs.filter((job) => job.aiScore !== null).length;
  // ai_score === null splits into two distinct cases (reports/dashboard-scoring-discrepancy.md):
  // - keywordScore === null: job has no job_scores row for this role
  //   selection at all -- its title/description don't match the active
  //   role's expandedRoles, so it will never be scored.
  // - keywordScore !== null: scoring ran -- either the keyword score was
  //   below the AI gate (permanent) or the AI call failed and will be
  //   retried on the next scoring run.
  const notEligibleCount = jobs.filter((job) => job.aiScore === null && job.keywordScore === null).length;
  const awaitingReviewCount = jobs.filter((job) => job.aiScore === null && job.keywordScore !== null).length;
  const pendingCount = notEligibleCount + awaitingReviewCount;
  const lastRun = scrapeRuns[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {lastRun ? `Last scraped ${new Date(lastRun.runAt).toLocaleString()} — ` : ""}
        {jobs.length} job{jobs.length === 1 ? "" : "s"} found, {scoredCount} scored by AI, {pendingCount} pending.{" "}
        {matchingRoleCount} job{matchingRoleCount === 1 ? "" : "s"} match &ldquo;{primaryRole}&rdquo; and{" "}
        {matchingRoleCount === 1 ? "is" : "are"} eligible for AI scoring under the current role selection.
      </p>
      {jobs.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {scrapeRuns.length === 0
            ? "No jobs scraped yet. The scrape pipeline runs via GitHub Actions — see Settings for details."
            : "No matching jobs yet for this role selection. Jobs are added by the next scheduled scrape run."}
        </div>
      ) : pendingCount > 0 ? (
        <div className="space-y-1">
          {awaitingReviewCount > 0 && (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              {awaitingReviewCount} of {jobs.length} job{jobs.length === 1 ? "" : "s"} awaiting AI review — keyword
              match score shown; some may stay below the AI scoring threshold and never receive an AI score.
            </div>
          )}
          {notEligibleCount > 0 && (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              {notEligibleCount} of {jobs.length} job{jobs.length === 1 ? "" : "s"} don&rsquo;t match &ldquo;
              {primaryRole}&rdquo; under the current role selection and won&rsquo;t be scored.
            </div>
          )}
        </div>
      ) : null}
      <FilterBar hasAiScores={scoredCount > 0} statuses={statuses} effectiveMaxYears={effectiveFilters.maxYears ?? null} />
      <JobsTable jobs={jobs} statuses={statuses} />
      {hasMore && (
        <Button asChild variant="outline" size="sm">
          <Link href={loadMoreHref(params, limit)}>Load more</Link>
        </Button>
      )}
    </div>
  );
}
