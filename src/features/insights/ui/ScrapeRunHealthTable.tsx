import type { SourceHealthSummary } from "@/features/sources/application/computeSourceHealthSummary";

// Distinct from SourceHealthTable (companies.health_status, board-token
// sources only, probe-driven): this renders the scrape_runs-derived summary
// (Phase 1 Task 5/7), which covers every source including the feed-based
// ones (wellfound/remoteok/mycareersfuture). The two signals are
// intentionally not reconciled -- see design/limitations.md.
const STATUS_STYLES: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  partial: "bg-yellow-100 text-yellow-800",
};

export function ScrapeRunHealthTable({ summaries }: { summaries: SourceHealthSummary[] }) {
  if (summaries.length === 0) {
    return <p className="text-sm text-muted-foreground">No scrape history yet.</p>;
  }

  const sorted = [...summaries].sort((a, b) => {
    if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
    return b.consecutiveFailures - a.consecutiveFailures;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Source</th>
            <th className="pb-2 pr-4 font-medium">Last run</th>
            <th className="pb-2 pr-4 font-medium">Success rate</th>
            <th className="pb-2 pr-4 font-medium">Avg latency</th>
            <th className="pb-2 pr-4 font-medium">Consecutive failures</th>
            <th className="pb-2 font-medium">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.source} className="border-b border-border last:border-0">
              <td className="py-2 pr-4 font-medium">{s.source}</td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-1.5">
                  {s.lastRunStatus ? (
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[s.lastRunStatus] ?? ""}`}
                    >
                      {s.lastRunStatus}
                    </span>
                  ) : (
                    "—"
                  )}
                  {s.isStale && (
                    <span
                      className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
                      title={`No run in ${Math.round(s.hoursSinceLastRun ?? 0)}h`}
                    >
                      stale
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 pr-4 tabular-nums">{(s.successRate * 100).toFixed(0)}%</td>
              <td className="py-2 pr-4 tabular-nums">
                {s.avgLatencyMs === null ? "—" : `${(s.avgLatencyMs / 1000).toFixed(1)}s`}
              </td>
              <td className="py-2 pr-4 tabular-nums">{s.consecutiveFailures}</td>
              <td className="py-2 text-muted-foreground">{s.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
