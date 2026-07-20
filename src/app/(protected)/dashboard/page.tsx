import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { Button } from "@/components/ui/button";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import type { JobFilters } from "@/features/jobs/domain/types";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseNotificationPreferencesRepository } from "@/features/notifications/infrastructure/SupabaseNotificationPreferencesRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { SCORING_QUEUE_CONFIG } from "@/features/scoring/domain/scoringQueueConfig";
import type { ScrapeRun } from "@/features/sources/domain/types";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import type { JobSource, LocationTag } from "@/shared/domain/enums";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";
import { optionalEnv } from "@/shared/infrastructure/env";
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
  q?: string;
  remote?: string;
  ineligible?: string;
  lowmatch?: string;
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
    if (Number.isInteger(value) && value >= 0 && value <= 50) {
      filters.maxYears = value;
    }
  }
  if (params.q && params.q.trim().length > 0) {
    filters.search = params.q.trim();
  }
  if (params.remote === "1") {
    filters.remoteOnly = true;
  }
  // Inverted vs the other flags: these are hidden unless asked for.
  if (params.ineligible === "1") {
    filters.includeIneligible = true;
  }
  if (params.lowmatch === "1") {
    filters.includeLowMatch = true;
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
  if (params.q) next.set("q", params.q);
  if (params.remote) next.set("remote", params.remote);
  if (params.ineligible) next.set("ineligible", params.ineligible);
  if (params.lowmatch) next.set("lowmatch", params.lowmatch);
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
        <DashboardContent roleSelectionId={activeSelection.id} filters={parseFilters(params)} params={params} />
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
  filters,
  params,
}: {
  roleSelectionId: string;
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
        <JobsSection roleSelectionId={roleSelectionId} filters={filters} params={params} scrapeRuns={scrapeRuns} />
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
  filters,
  params,
  scrapeRuns,
}: {
  roleSelectionId: string;
  filters: JobFilters;
  params: DashboardSearchParams;
  scrapeRuns: ScrapeRun[];
}) {
  const client = await createSupabaseServerClient();
  const jobRepository = new SupabaseJobRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);
  const notificationPreferencesRepository = new SupabaseNotificationPreferencesRepository(client);
  const limit = parseLimit(params);

  const [desiredExperience, notificationPreferences] = await Promise.all([
    settingsRepository.getDesiredExperienceYears(),
    notificationPreferencesRepository.getPreferences(),
  ]);
  const effectiveFilters: JobFilters = {
    ...filters,
    maxYears: filters.maxYears ?? desiredExperience ?? undefined,
    // Muted companies/employment-types/keywords (Settings → Notifications)
    // hide jobs everywhere, not just Telegram alerts -- always enforced, no
    // per-request override.
    excludeCompanies: notificationPreferences?.blockedCompanies,
    excludeEmploymentTypes: notificationPreferences?.excludeEmploymentTypes,
    excludeKeywords: notificationPreferences?.excludeKeywords,
  };

  const activeResume = await resumeRepository.getActive();
  const resumeVersion = activeResume?.version ?? 0;

  // Same default as score.ts -- it decides which unscored jobs are genuinely
  // queued for AI vs deliberately skipped below the gate.
  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));

  const [{ jobs, hasMore, total, stats }, statuses] = await Promise.all([
    jobRepository.findForDashboard(
      roleSelectionId,
      effectiveFilters,
      limit,
      resumeVersion,
      keywordThreshold,
      SCORING_QUEUE_CONFIG.maxAiRetries,
    ),
    jobRepository.listStatuses(),
  ]);

  const lastRun = scrapeRuns[0];
  const isHighMatchFilter = params.minScore !== undefined && Number(params.minScore) >= 0.75;

  function formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "< 1h ago";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="space-y-4">
      {/* Compact stats row -- every number describes the filtered set below,
          so "showing X of Y" and the breakdown always reconcile. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm">
          <span className="font-semibold tabular-nums">
            {jobs.length < total ? `${jobs.length} of ${total}` : total}
          </span>
          <span className="ml-1 text-muted-foreground">jobs</span>
        </span>
        <span className="text-sm">
          <span className="font-semibold tabular-nums">{stats.scoredCount}</span>
          <span className="ml-1 text-muted-foreground">AI-scored</span>
        </span>
        {stats.lowMatchCount > 0 && (
          <span className="text-sm">
            <span className="font-semibold tabular-nums">{stats.lowMatchCount}</span>
            <span className="ml-1 text-muted-foreground">
              low match{effectiveFilters.includeLowMatch ? "" : " (hidden)"}
            </span>
          </span>
        )}
        {stats.awaitingAiCount > 0 && (
          <span className="text-sm">
            <span className="font-semibold tabular-nums">{stats.awaitingAiCount}</span>
            <span className="ml-1 text-muted-foreground">queued</span>
          </span>
        )}
        {stats.abandonedCount > 0 && (
          <span className="text-sm" title={`AI scoring failed ${SCORING_QUEUE_CONFIG.maxAiRetries}x — no longer retried`}>
            <span className="font-semibold tabular-nums">{stats.abandonedCount}</span>
            <span className="ml-1 text-muted-foreground">gave up</span>
          </span>
        )}
        {lastRun && (
          <span className="text-xs text-muted-foreground md:ml-auto">
            Updated {formatRelative(lastRun.runAt)}
          </span>
        )}
      </div>

      {/* Worth Reviewing entry point banner */}
      {isHighMatchFilter && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="font-medium">Showing high-match jobs (≥{Math.round(Number(params.minScore) * 100)}%)</span>
          <Link href="/dashboard" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Clear
          </Link>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
          {scrapeRuns.length === 0
            ? "No jobs scraped yet. The scrape pipeline runs via GitHub Actions — see Settings for details."
            : "No matching jobs yet for this role selection. Jobs are added by the next scheduled scrape run."}
        </div>
      ) : (
        // Only the genuine AI-retry queue is called "awaiting" -- low-match
        // jobs were skipped at the keyword gate on purpose and will never be
        // AI-scored for this role/resume, so promising a review would be a lie.
        stats.awaitingAiCount > 0 && (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
            {stats.awaitingAiCount} job{stats.awaitingAiCount === 1 ? "" : "s"} awaiting AI review — keyword score shown for now.
          </div>
        )
      )}

      <FilterBar hasAiScores={stats.scoredCount > 0} statuses={statuses} effectiveMaxYears={effectiveFilters.maxYears ?? null} />
      <JobsTable jobs={jobs} statuses={statuses} />

      {hasMore && (
        <Button asChild variant="outline" size="sm">
          <Link href={loadMoreHref(params, limit)} scroll={false}>Load more</Link>
        </Button>
      )}
    </div>
  );
}
