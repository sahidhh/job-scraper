import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeJobsBySource } from "@/features/insights/application/computeJobsBySource";
import { computeJobsOverTime } from "@/features/insights/application/computeJobsOverTime";
import { computeJobsByExperience } from "@/features/insights/application/computeJobsByExperience";
import { computeJobsByLocation } from "@/features/insights/application/computeJobsByLocation";
import { bucketScores } from "@/features/insights/application/bucketScores";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";
import {
  JobsOverTimeChart,
  JobsBySourceChart,
  ScoreHistogramChart,
  StatusBreakdownChart,
  JobsByExperienceChart,
  JobsByLocationChart,
  ScoredBySourceChart,
  TokenStatsCards,
} from "@/features/insights/ui/AnalyticsCharts";
import { SourceHealthTable } from "@/features/insights/ui/SourceHealthTable";

export default async function AnalyticsPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const repo = new SupabaseMatchedJobsRepository(client);
  const companyRepo = new SupabaseCompanyRepository(client);

  const activeSelection = await roleRepository.getActiveSelection();

  const [scrapeRuns, aiScores, statusBreakdown, experienceData, locationData, tokenStats, scoredBySource, companies] =
    await Promise.all([
      repo.getScrapeRuns(),
      activeSelection ? repo.getAiScores(activeSelection.id) : Promise.resolve([]),
      repo.getStatusBreakdown(),
      repo.getJobsExperienceData(),
      repo.getJobsLocationData(),
      repo.getTokenUsageStats(),
      activeSelection ? repo.getScoredJobsBySource(activeSelection.id) : Promise.resolve([]),
      companyRepo.list(),
    ]);

  const jobsOverTime = computeJobsOverTime(scrapeRuns);
  const bySource = computeJobsBySource(scrapeRuns);
  const histogram = bucketScores(aiScores.map((s) => Math.round(s * 100)));
  const byExperience = computeJobsByExperience(experienceData);
  const byLocation = computeJobsByLocation(locationData);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Scrape activity, AI cost, and job score distribution.</p>
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
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Source health</h2>
        <Card>
          <CardContent className="pt-4">
            <SourceHealthTable companies={companies} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
