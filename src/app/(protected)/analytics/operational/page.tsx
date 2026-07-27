import { PipelineStatsCards, ScoringQueueStatsCards, TokenStatsCards } from "@/features/insights/ui/AnalyticsCharts";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { computePipelineStats } from "@/features/insights/application/computePipelineStats";
import { SupabaseMatchedJobsRepository } from "@/features/insights/infrastructure/SupabaseMatchedJobsRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { getScoringQueueReport } from "@/features/scoring/application/getScoringQueueReport";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function OperationalAnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const scrapeRunRepository = new SupabaseScrapeRunRepository(supabase);
  const recentRuns = await scrapeRunRepository.listRecent(10);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Operational Pipeline</h2>
        <PipelineStatsCards stats={{ active: 0, applied: 0, interested: 0, rejected: 0, archived: 0 }} />
        <ScoringQueueStatsCards summary={{ total: 0, awaiting: 0, lowMatch: 0, gaveUp: 0 }} />
        <TokenStatsCards stats={{ inputTokens: 0, outputTokens: 0, costUsd: 0 }} />
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
    </div>
  );
}
