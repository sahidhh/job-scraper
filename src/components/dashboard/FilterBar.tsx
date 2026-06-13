"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";

export function FilterBar() {
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

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={searchParams.get("location") ?? "all"} onValueChange={(value) => updateParam("location", value)}>
        <SelectTrigger className="w-40">
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
        <SelectTrigger className="w-40">
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

      <Input
        type="number"
        min={0}
        max={1}
        step={0.05}
        placeholder="Min AI score"
        defaultValue={searchParams.get("minScore") ?? ""}
        onBlur={(event) => updateParam("minScore", event.target.value)}
        className="w-32"
      />
    </div>
  );
}
