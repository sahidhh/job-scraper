import { readFileSync } from "node:fs";
import { mapManualMatch } from "@/features/jobs/application/mapManualMatch";
import type { NormalizedJob } from "@/features/jobs/domain/types";

// Companion to import-manual-matches.ts for environments that can reach
// Supabase only via the Supabase MCP connector's Execute SQL tool (e.g. a
// cloud Claude Code routine) instead of SUPABASE_SERVICE_ROLE_KEY, which
// design/security.md §3 restricts to scripts/ run with real repo secrets.
// Reuses the same mapManualMatch() as import-manual-matches.ts -- location
// tagging and field validation stay in one place -- but only prints the
// equivalent upsert SQL to stdout; it never touches the network itself.
export function sqlString(value: string | null): string {
  if (value === null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlLocationTagArray(tags: readonly string[]): string {
  if (tags.length === 0) return "'{}'::location_tag[]";
  return `ARRAY[${tags.map((tag) => sqlString(tag)).join(", ")}]::location_tag[]`;
}

export function buildUpsertSql(jobs: readonly NormalizedJob[]): string {
  if (jobs.length === 0) {
    throw new Error("buildUpsertSql: no jobs to insert");
  }

  const rows = jobs.map((job) => {
    const values = [
      sqlString(job.source),
      sqlString(job.sourceJobId),
      sqlString(job.companyName),
      sqlString(job.title),
      sqlString(job.locationRaw),
      sqlLocationTagArray(job.locationTags),
      sqlString(job.description),
      sqlString(job.url),
      job.postedAt ? sqlString(job.postedAt) : "null",
      job.manualScore ?? "null",
      sqlString(job.manualStandout ?? null),
      sqlString(job.manualVerify ?? null),
      sqlString(job.manualRequirements ?? null),
    ];
    return `(${values.join(", ")})`;
  });

  return `insert into jobs (
  source, source_job_id, company_name, title, location_raw, location_tags,
  description, url, posted_at, manual_score, manual_standout, manual_verify,
  manual_requirements
) values
${rows.join(",\n")}
on conflict (source, source_job_id) do update set
  title = excluded.title,
  location_raw = excluded.location_raw,
  location_tags = excluded.location_tags,
  description = excluded.description,
  url = excluded.url,
  posted_at = excluded.posted_at,
  manual_score = excluded.manual_score,
  manual_standout = excluded.manual_standout,
  manual_verify = excluded.manual_verify,
  manual_requirements = excluded.manual_requirements,
  updated_at = now();`;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("[print-manual-matches-sql] usage: tsx scripts/print-manual-matches-sql.ts <path-to-state.json>");
    process.exit(1);
  }

  const state = JSON.parse(readFileSync(filePath, "utf-8"));
  const jobs = (state.jobs ?? []).map(mapManualMatch);

  if (jobs.length === 0) {
    console.error("[print-manual-matches-sql] no jobs in input file, nothing to print");
    process.exit(1);
  }

  console.log(buildUpsertSql(jobs));
}

if (process.argv[1]?.endsWith("print-manual-matches-sql.ts")) {
  main().catch((err) => {
    console.error("[print-manual-matches-sql] fatal error:", err);
    process.exit(1);
  });
}
