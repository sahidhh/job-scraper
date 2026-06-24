import type { Company } from "@/features/companies/domain/types";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  unhealthy: "bg-yellow-100 text-yellow-800",
  disabled: "bg-red-100 text-red-800",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SourceHealthTable({ companies }: { companies: Company[] }) {
  if (companies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No board-token sources configured.</p>
    );
  }

  const sorted = [...companies].sort((a, b) => {
    const rank = { disabled: 0, unhealthy: 1, active: 2 } as const;
    return (
      (rank[a.healthStatus] ?? 3) - (rank[b.healthStatus] ?? 3) ||
      b.consecutiveFailures - a.consecutiveFailures
    );
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Company</th>
            <th className="pb-2 pr-4 font-medium">Source</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 font-medium">Failures</th>
            <th className="pb-2 pr-4 font-medium">Last success</th>
            <th className="pb-2 font-medium">Last failure</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-4 font-medium">{c.name}</td>
              <td className="py-2 pr-4 text-muted-foreground">{c.source}</td>
              <td className="py-2 pr-4">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.healthStatus] ?? ""}`}
                >
                  {c.healthStatus}
                </span>
              </td>
              <td className="py-2 pr-4 tabular-nums">{c.consecutiveFailures}</td>
              <td className="py-2 pr-4 text-muted-foreground tabular-nums">
                {formatRelative(c.lastSuccessAt)}
              </td>
              <td className="py-2 text-muted-foreground tabular-nums">
                {formatRelative(c.lastFailureAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
