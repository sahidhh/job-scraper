import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type { Company, SourceHealthStatus } from "@/features/companies/domain/types";

// Keyed on the union rather than `string`, so adding a health status is a type
// error here instead of a silently unstyled pill.
const STATUS_VARIANT: Record<SourceHealthStatus, ComponentProps<typeof Badge>["variant"]> = {
  active: "success",
  unhealthy: "warning",
  disabled: "destructive",
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
                <Badge variant={STATUS_VARIANT[c.healthStatus]}>{c.healthStatus}</Badge>
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
