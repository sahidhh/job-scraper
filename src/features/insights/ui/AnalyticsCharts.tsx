"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoringQueueSummary } from "@/features/scoring/application/computeScoringQueueSummary";
import type {
  JobsByCompanyEntry,
  JobsByExperiencePoint,
  JobsByLocationPoint,
  JobsBySourceEntry,
  JobsOverTimePoint,
  PipelineStats,
  RemoteStats,
  SalaryStatsEntry,
  ScoreHistogramBucket,
  StatusBreakdownEntry,
  TokenUsageStats,
} from "@/features/insights/domain/types";

export function JobsOverTimeChart({ data }: { data: JobsOverTimePoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#6366f1" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function JobsBySourceChart({ data }: { data: JobsBySourceEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="source" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill="#6366f1" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreHistogramChart({ data }: { data: ScoreHistogramBucket[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bucket" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusBreakdownChart({ data }: { data: StatusBreakdownEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count">
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function JobsByExperienceChart({ data }: { data: JobsByExperiencePoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  const formatted = data.map((p) => ({
    ...p,
    label: p.minYears === null ? "Unknown" : String(p.minYears),
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#10b981" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function JobsByLocationChart({ data }: { data: JobsByLocationPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="location" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#f59e0b" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScoredBySourceChart({ data }: { data: JobsBySourceEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No AI-scored jobs yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="source" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill="#8b5cf6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TokenStatsCards({ stats }: { stats: TokenUsageStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Input tokens" value={stats.totalTokensInput.toLocaleString()} />
      <StatCard label="Output tokens" value={stats.totalTokensOutput.toLocaleString()} />
      <StatCard label="Est. cost" value={`$${stats.totalCostUsd.toFixed(4)}`} />
      <StatCard label="Jobs AI-scored" value={stats.jobsScoredByAi.toLocaleString()} />
    </div>
  );
}

export function JobsByCompanyChart({ data }: { data: JobsByCompanyEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="company" width={110} />
        <Tooltip />
        <Bar dataKey="count" fill="#ec4899" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalaryStatsCards({ data }: { data: SalaryStatsEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No salary data extracted yet.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {data.map((entry) => (
        <StatCard
          key={entry.currency}
          label={`${entry.currency} (${entry.count} job${entry.count === 1 ? "" : "s"})`}
          value={`${Math.round(entry.avgMin).toLocaleString()}–${Math.round(entry.avgMax).toLocaleString()}`}
        />
      ))}
    </div>
  );
}

export function RemoteStatCard({ stats }: { stats: RemoteStats }) {
  return (
    <StatCard
      label={`Remote jobs (${stats.remoteCount}/${stats.totalCount})`}
      value={`${stats.remotePercentage.toFixed(0)}%`}
    />
  );
}

export function PipelineStatsCards({ stats }: { stats: PipelineStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Scrape runs" value={stats.totalRuns.toLocaleString()} />
      <StatCard label="Failed runs" value={stats.failedRuns.toLocaleString()} />
      <StatCard label="Duplicates skipped" value={stats.totalDuplicates.toLocaleString()} />
      <StatCard
        label="Avg scrape latency"
        value={stats.avgDurationMs === null ? "—" : `${(stats.avgDurationMs / 1000).toFixed(1)}s`}
      />
    </div>
  );
}

export function ScoringQueueStatsCards({ summary }: { summary: ScoringQueueSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Awaiting AI score" value={summary.awaitingAiCount.toLocaleString()} />
      <StatCard
        label="Oldest pending"
        value={summary.oldestPendingAgeHours === null ? "—" : `${summary.oldestPendingAgeHours.toFixed(1)}h`}
      />
      <StatCard label="Stuck jobs" value={summary.stuckJobs.length.toLocaleString()} />
      <StatCard label="Max retries" value={summary.maxRetryCount.toLocaleString()} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
