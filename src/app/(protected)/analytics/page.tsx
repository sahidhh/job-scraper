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

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pipeline</h2>
        <PipelineStatsCards stats={pipelineStats} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Scoring queue</h2>
        {scoringQueueSummary ? (
          <ScoringQueueStatsCards summary={scoringQueueSummary} />
        ) : (
          <p className="text-sm text-muted-foreground">No active role selection or resume — nothing queued.</p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">AI cost &amp; usage</h2>
        <TokenStatsCards stats={tokenStats} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Jobs found over time</CardTitle></CardHeader>
          <CardContent><JobsOverTimeChart data={jobsOverTime} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Jobs found by source</CardTitle></CardHeader>
          <CardContent><JobsBySourceChart data={bySource} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI-scored jobs by source</CardTitle></CardHeader>
          <CardContent><ScoredBySourceChart data={scoredBySource} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI score distribution</CardTitle></CardHeader>
          <CardContent><ScoreHistogramChart data={histogram} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Job status breakdown</CardTitle></CardHeader>
          <CardContent><StatusBreakdownChart data={statusBreakdown} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Jobs by experience</CardTitle></CardHeader>
          <CardContent><JobsByExperienceChart data={byExperience} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Jobs by location</CardTitle></CardHeader>
          <CardContent><JobsByLocationChart data={byLocation} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Jobs by company</CardTitle></CardHeader>
          <CardContent><JobsByCompanyChart data={byCompany} /></CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Job metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RemoteStatCard stats={remoteStats} />
        </div>
        <SalaryStatsCards data={salaryStats} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Source health (probe-based)</h2>
        <Card>
          <CardContent className="pt-4">
            <SourceHealthTable companies={companies} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Source health (scrape-based, all sources)</h2>
        <Card>
          <CardContent className="pt-4">
            <ScrapeRunHealthTable summaries={sourceHealthReport} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
