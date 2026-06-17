"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { JobStatus } from "@/features/jobs/domain/types";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";

export function FilterBar({
  hasAiScores,
  statuses,
  effectiveMaxYears,
}: {
  hasAiScores: boolean;
  statuses: JobStatus[];
  effectiveMaxYears: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.length === 0 || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  function toggleArchived(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) {
      params.set("archived", "1");
    } else {
      params.delete("archived");
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={searchParams.get("location") ?? "all"} onValueChange={(value) => updateParam("location", value)}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Location" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All locations</SelectItem>
          {LOCATION_TAGS.map((tag) => (
            <SelectItem key={tag} value={tag}>
              {tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("source") ?? "all"} onValueChange={(value) => updateParam("source", value)}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {JOB_SOURCES.map((source) => (
            <SelectItem key={source} value={source}>
              {source}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => updateParam("status", value)}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        min={0}
        max={1}
        step={0.05}
        placeholder="Min AI score"
        defaultValue={searchParams.get("minScore") ?? ""}
        onBlur={(event) => updateParam("minScore", event.target.value)}
        disabled={!hasAiScores}
        title={hasAiScores ? undefined : "AI scoring hasn't run for these jobs yet — this filter has no effect until jobs are AI-scored."}
        className="w-full sm:w-32"
      />

      <Input
        type="number"
        min={0}
        max={50}
        step={1}
        placeholder={effectiveMaxYears === null ? "Max years" : `Max yrs (${effectiveMaxYears})`}
        defaultValue={searchParams.get("maxYears") ?? ""}
        onBlur={(event) => updateParam("maxYears", event.target.value)}
        title="Hide jobs requiring more than this many years. Jobs with unknown experience always show. Defaults to your Settings value."
        className="w-full sm:w-32"
      />

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground sm:w-auto">
        <input
          type="checkbox"
          checked={searchParams.get("archived") === "1"}
          onChange={(event) => toggleArchived(event.target.checked)}
          className="size-4 accent-primary"
        />
        Show archived
      </label>
    </div>
  );
}
