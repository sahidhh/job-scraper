import { computePipelineStats } from "@/features/insights/application/computePipelineStats";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import { PipelineStatsCards, ScoringQueueStatsCards, TokenStatsCards } from "@/features/insights/ui/AnalyticsCharts";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { getScoringQueueReport } from "@/features/scoring/application/getScoringQueueReport";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function AnalyticsOverviewPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const repo = new SupabaseMatchedJobsRepository(client);
  const scoreRepository = new SupabaseScoreRepository(client);

  const [activeSelection, activeResume] = await Promise.all([
    roleRepository.getActiveSelection(),
    resumeRepository.getActive(),
  ]);
  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));

  const [scrapeRunStats, tokenStats, scoringQueueSummary] = await Promise.all([
    repo.getScrapeRunStats(),
    repo.getTokenUsageStats(),
    activeSelection && activeResume
      ? getScoringQueueReport({
          scoreRepository,
          roleSelectionId: activeSelection.id,
          resumeVersion: activeResume.version,
          keywordThreshold,
        })
      : Promise.resolve(null),
  ]);

  const pipelineStats = computePipelineStats(scrapeRunStats);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Pipeline</h2>
        <PipelineStatsCards stats={pipelineStats} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scoring queue</h2>
        {scoringQueueSummary ? (
          <ScoringQueueStatsCards summary={scoringQueueSummary} />
        ) : (
          <p className="text-sm text-muted-foreground">No active role selection or resume — nothing queued.</p>
        )}
      </section>

      <TokenStatsCards stats={tokenStats} />
    </div>
  );
}
