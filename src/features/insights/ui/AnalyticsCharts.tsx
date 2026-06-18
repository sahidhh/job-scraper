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
