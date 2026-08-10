import { ManualMatchStatsCards, PipelineStatsCards, ScoringQueueStatsCards, TokenStatsCards } from "@/features/insights/ui/AnalyticsCharts";
import { computePipelineStats } from "@/features/insights/application/computePipelineStats";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { getScoringQueueReport } from "@/features/scoring/application/getScoringQueueReport";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

// Operational health view: scraper health, scrape success/failure, source
// health signal, AI request volume/cost, and recent failures -- all sourced
// from existing repositories, same pattern as /analytics/overview.
export default async function OperationalAnalyticsPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const matchedJobsRepository = new SupabaseMatchedJobsRepository(client);
  const scoreRepository = new SupabaseScoreRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);

  const [activeSelection, activeResume] = await Promise.all([
    roleRepository.getActiveSelection(),
    resumeRepository.getActive(),
  ]);
  const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));

  const [scrapeRunStats, tokenStats, scoringQueueSummary, recentRuns, manualMatchStats] = await Promise.all([
    matchedJobsRepository.getScrapeRunStats(),
    matchedJobsRepository.getTokenUsageStats(),
    activeSelection && activeResume
      ? getScoringQueueReport({
          scoreRepository,
          roleSelectionId: activeSelection.id,
          resumeVersion: activeResume.version,
          keywordThreshold,
        })
      : Promise.resolve(null),
    scrapeRunRepository.listRecent(10),
    matchedJobsRepository.getManualMatchStats(),
  ]);

  const pipelineStats = computePipelineStats(scrapeRunStats);
  const recentFailures = recentRuns.filter((run) => run.status === "failed");

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Operational Pipeline</h2>
        <PipelineStatsCards stats={pipelineStats} />
        {scoringQueueSummary ? (
          <ScoringQueueStatsCards summary={scoringQueueSummary} />
        ) : (
          <p className="text-sm text-muted-foreground">No active role selection or resume — nothing queued.</p>
        )}
        <TokenStatsCards stats={tokenStats} />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Scrape Runs</h2>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Found</th>
                <th className="px-4 py-2">Failed</th>
                <th className="px-4 py-2">Run At</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-b">
                  <td className="px-4 py-2">{run.source}</td>
                  <td className="px-4 py-2">{run.status}</td>
                  <td className="px-4 py-2">{run.foundCount}</td>
                  <td className="px-4 py-2">{run.failedCount}</td>
                  <td className="px-4 py-2">{new Date(run.runAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Claude Routine (Manual Matches)</h2>
        <ManualMatchStatsCards stats={manualMatchStats} />
        {manualMatchStats.recentDays.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Jobs Added</th>
                  <th className="px-4 py-2">Runs</th>
                </tr>
              </thead>
              <tbody>
                {manualMatchStats.recentDays.map((day) => (
                  <tr key={day.date} className="border-b">
                    <td className="px-4 py-2">{day.date}</td>
                    <td className="px-4 py-2">{day.count}</td>
                    <td className="px-4 py-2">{day.runCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recentFailures.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Failures</h2>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Failure Category</th>
                  <th className="px-4 py-2">Error</th>
                  <th className="px-4 py-2">Run At</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.map((run) => (
                  <tr key={run.id} className="border-b">
                    <td className="px-4 py-2">{run.source}</td>
                    <td className="px-4 py-2">{run.failureCategory ?? "Unavailable"}</td>
                    <td className="px-4 py-2">{run.error ?? "Unavailable"}</td>
                    <td className="px-4 py-2">{new Date(run.runAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
