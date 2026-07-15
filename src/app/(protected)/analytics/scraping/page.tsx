import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bucketScores } from "@/features/insights/application/bucketScores";
import { computeJobsBySource } from "@/features/insights/application/computeJobsBySource";
import { computeJobsOverTime } from "@/features/insights/application/computeJobsOverTime";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import {
  JobsBySourceChart,
  JobsOverTimeChart,
  ScoreHistogramChart,
  ScoredBySourceChart,
} from "@/features/insights/ui/AnalyticsCharts";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function AnalyticsScrapingPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const repo = new SupabaseMatchedJobsRepository(client);

  const activeSelection = await roleRepository.getActiveSelection();

  const [scrapeRuns, aiScores, scoredBySource] = await Promise.all([
    repo.getScrapeRuns(),
    activeSelection ? repo.getAiScores(activeSelection.id) : Promise.resolve([]),
    activeSelection ? repo.getScoredJobsBySource(activeSelection.id) : Promise.resolve([]),
  ]);

  const jobsOverTime = computeJobsOverTime(scrapeRuns);
  const bySource = computeJobsBySource(scrapeRuns);
  const histogram = bucketScores(aiScores.map((s) => Math.round(s * 100)));

  return (
    <div className="space-y-6">
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
    </div>
  );
}
