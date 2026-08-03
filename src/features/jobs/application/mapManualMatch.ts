import { tagLocations } from "@/features/filtering/application/tagLocations";
import type { RawJob } from "@/features/sources/domain/types";
import type { NormalizedJob } from "../domain/types";

// One entry of job-match-tracker's state.json `jobs[]` array (README/
// docs/tasks/manual-job-matches.md §1). Only the fields mapped below are
// typed; the source file may carry more (yoe, salary, tags) that this
// mapping doesn't use yet.
export interface ManualMatchEntry {
  id: string;
  title: string;
  company: string;
  location: string;
  score: number;
  standout?: string | null;
  verify?: string | null;
  requirements?: string | null;
  link: string;
}

// Maps one manual-routine match to a NormalizedJob-shaped insert
// (docs/tasks/manual-job-matches.md §3). Fails loud on missing required
// fields rather than silently dropping a partial row (§7 risk mitigation).
export function mapManualMatch(entry: ManualMatchEntry): NormalizedJob {
  if (!entry.id?.trim() || !entry.title?.trim() || !entry.company?.trim()) {
    throw new Error(`mapManualMatch: entry missing required id/title/company: ${JSON.stringify(entry)}`);
  }

  const rawJob: RawJob = {
    source: "claude_routine",
    sourceJobId: entry.id,
    companyId: null,
    companyName: entry.company,
    title: entry.title,
    locationRaw: entry.location ?? "",
    description: entry.requirements ?? "",
    url: entry.link,
    postedAt: null,
  };
  const locationTags = tagLocations([rawJob])[0]?.locationTags ?? [];

  return {
    source: rawJob.source,
    sourceJobId: rawJob.sourceJobId,
    companyId: rawJob.companyId,
    companyName: rawJob.companyName,
    title: rawJob.title,
    locationRaw: rawJob.locationRaw,
    locationTags,
    description: rawJob.description,
    url: rawJob.url,
    postedAt: rawJob.postedAt,
    manualScore: entry.score,
    manualStandout: entry.standout ?? null,
    manualVerify: entry.verify ?? null,
    manualRequirements: entry.requirements ?? null,
  };
}
