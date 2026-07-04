import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeJobsBySource } from "@/features/insights/application/computeJobsBySource";
import { computeJobsOverTime } from "@/features/insights/application/computeJobsOverTime";
import { computeJobsByExperience } from "@/features/insights/application/computeJobsByExperience";
import { computeJobsByLocation } from "@/features/insights/application/computeJobsByLocation";
import { computeJobsByCompany } from "@/features/insights/application/computeJobsByCompany";
import { computeSalaryStats } from "@/features/insights/application/computeSalaryStats";
import { computeRemoteStats } from "@/features/insights/application/computeRemoteStats";
import { computePipelineStats } from "@/features/insights/application/computePipelineStats";
import { bucketScores } from "@/features/insights/application/bucketScores";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { getScoringQueueReport } from "@/features/scoring/application/getScoringQueueReport";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { getSourceHealthReport } from "@/features/sources/application/getSourceHealthReport";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import { optionalEnv } from "@/shared/infrastructure/env";
import {
  JobsOverTimeChart,
  JobsBySourceChart,
  ScoreHistogramChart,
  StatusBreakdownChart,
  JobsByExperienceChart,
  JobsByLocationChart,
  JobsByCompanyChart,
  ScoredBySourceChart,
  TokenStatsCards,
  SalaryStatsCards,
  RemoteStatCard,
  PipelineStatsCards,
  ScoringQueueStatsCards,
} from "@/features/insights/ui/AnalyticsCharts";
import { SourceHealthTable } from "@/features/insights/ui/SourceHealthTable";
import { ScrapeRunHealthTable } from "@/features/insights/ui/ScrapeRunHealthTable";

export default async function AnalyticsPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const repo = new SupabaseMatchedJobsRepository(client);
  const companyRepo = new SupabaseCompanyRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const scoreRepository = new SupabaseScoreRepository(client);

  const [activeSelection, activeResume] = await Promise.all([
    roleRepository.getActiveSelection(),
    resumeRepository.getActive(),
  ]);
  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));

  const [
    scrapeRuns,
    aiScores,
    statusBreakdown,
    experienceData,
    locationData,
    tokenStats,
    scoredBySource,
    companies,
    companyData,
    salaryData,
    scrapeRunStats,
    sourceHealthReport,
    scoringQueueSummary,
  ] = await Promise.all([
    repo.getScrapeRuns(),
    activeSelection ? repo.getAiScores(activeSelection.id) : Promise.resolve([]),
    repo.getStatusBreakdown(),
    repo.getJobsExperienceData(),
    repo.getJobsLocationData(),
    repo.getTokenUsageStats(),
    activeSelection ? repo.getScoredJobsBySource(activeSelection.id) : Promise.resolve([]),
    companyRepo.list(),
    repo.getJobsCompanyData(),
    repo.getJobsSalaryData(),
    repo.getScrapeRunStats(),
    getSourceHealthReport(scrapeRunRepository),
    activeSelection && activeResume
      ? getScoringQueueReport({
          scoreRepository,
          roleSelectionId: activeSelection.id,
          resumeVersion: activeResume.version,
          keywordThreshold,
        })
      : Promise.resolve(null),
  ]);

  const jobsOverTime = computeJobsOverTime(scrapeRuns);
  const bySource = computeJobsBySource(scrapeRuns);
  const histogram = bucketScores(aiScores.map((s) => Math.round(s * 100)));
  const byExperience = computeJobsByExperience(experienceData);
  const byLocation = computeJobsByLocation(locationData);
  const byCompany = computeJobsByCompany(companyData);
  const salaryStats = computeSalaryStats(salaryData);
  const remoteStats = computeRemoteStats(locationData);
  const pipelineStats = computePipelineStats(scrapeRunStats);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Scrape activity, AI cost, and job score distribution.</p>
      </div>

      {/* Pipeline */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Pipeline</h2>
        <PipelineStatsCards stats={pipelineStats} />
      </section>

      {/* Scoring queue */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scoring queue</h2>
        {scoringQueueSummary ? (
          <ScoringQueueStatsCards summary={scoringQueueSummary} />
        ) : (
          <p className="text-sm text-muted-foreground">No active role selection or resume — nothing queued.</p>
        )}
      </section>

      {/* Key stats — always visible at top */}
      <TokenStatsCards stats={tokenStats} />

      {/* Scraping activity */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scraping activity</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Jobs over time</CardTitle></CardHeader>
            <CardContent><JobsOverTimeChart data={jobsOverTime} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Jobs by source</CardTitle></CardHeader>
            <CardContent><JobsBySourceChart data={bySource} /></CardContent>
          </Card>
        </div>
      </section>

      {/* Scoring quality */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scoring quality</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">AI-scored by source</CardTitle></CardHeader>
            <CardContent><ScoredBySourceChart data={scoredBySource} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Score distribution</CardTitle></CardHeader>
            <CardContent><ScoreHistogramChart data={histogram} /></CardContent>
          </Card>
        </div>
      </section>

      {/* Job breakdown */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Job breakdown</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent><StatusBreakdownChart data={statusBreakdown} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Experience required</CardTitle></CardHeader>
            <CardContent><JobsByExperienceChart data={byExperience} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Location</CardTitle></CardHeader>
            <CardContent><JobsByLocationChart data={byLocation} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Company</CardTitle></CardHeader>
            <CardContent><JobsByCompanyChart data={byCompany} /></CardContent>
          </Card>
        </div>
      </section>

      {/* Job metrics */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Job metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RemoteStatCard stats={remoteStats} />
        </div>
        <SalaryStatsCards data={salaryStats} />
      </section>

      {/* Source health */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Source health</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Probe-based</CardTitle></CardHeader>
            <CardContent><SourceHealthTable companies={companies} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Scrape-based (all sources)</CardTitle></CardHeader>
            <CardContent><ScrapeRunHealthTable summaries={sourceHealthReport} /></CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
