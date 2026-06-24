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
import type {
  JobsByExperiencePoint,
  JobsByLocationPoint,
  JobsBySourceEntry,
  JobsOverTimePoint,
  ScoreHistogramBucket,
  StatusBreakdownEntry,
  TokenUsageStats,
} from "@/features/insights/domain/types";

function shortDate(v: string): string {
  try {
    const d = new Date(v);
    return d.toLocaleString("default", { month: "short", day: "numeric" });
  } catch {
    return v;
  }
}

function truncate(v: string, max = 9): string {
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

const CHART_HEIGHT = 240;
const AXIS_STYLE = { fontSize: 11, fill: "var(--muted-foreground)" };

export function JobsOverTimeChart({ data }: { data: JobsOverTimePoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          labelFormatter={(v) => shortDate(String(v))}
        />
        <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function JobsBySourceChart({ data }: { data: JobsBySourceEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="source"
          tickFormatter={(v) => truncate(v)}
          tick={{ ...AXIS_STYLE, angle: -30, textAnchor: "end" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          height={44}
        />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreHistogramChart({ data }: { data: ScoreHistogramBucket[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={{ ...AXIS_STYLE, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={1}
        />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusBreakdownChart({ data }: { data: StatusBreakdownEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
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
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={formatted} margin={{ bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function JobsByLocationChart({ data }: { data: JobsByLocationPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="location" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoredBySourceChart({ data }: { data: JobsBySourceEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No AI-scored jobs yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="source"
          tickFormatter={(v) => truncate(v)}
          tick={{ ...AXIS_STYLE, angle: -30, textAnchor: "end" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          height={44}
        />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TokenStatsCards({ stats }: { stats: TokenUsageStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Jobs scored" value={stats.jobsScoredByAi.toLocaleString()} />
      <StatCard label="Est. cost" value={`$${stats.totalCostUsd.toFixed(4)}`} />
      <StatCard label="Input tokens" value={stats.totalTokensInput.toLocaleString()} />
      <StatCard label="Output tokens" value={stats.totalTokensOutput.toLocaleString()} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
