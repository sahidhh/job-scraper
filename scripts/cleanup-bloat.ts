import path from "node:path";
import { pathToFileURL } from "node:url";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { jobMatchesRoles } from "@/features/sources/domain/roleMatch";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;
const DEFAULT_MAX_AGE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CleanupJobRow {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly min_years: number | null;
  readonly is_active: boolean;
  readonly first_seen_at: string;
  readonly posted_at?: string | null;
}

export interface ProtectedIds {
  readonly jobStateIds: ReadonlySet<string>;
  readonly applicationIds: ReadonlySet<string>;
  readonly notificationIds: ReadonlySet<string>;
}

export interface PartitionOptions {
  readonly maxAgeDays?: number;
  readonly now?: Date;
}

export interface PartitionResult {
  readonly total: number;
  readonly preservedIds: string[];
  readonly toDeleteIds: string[];
  readonly toArchiveIds: string[];
}

export function parseCleanupMode(argv: readonly string[]): { execute: boolean } {
  return { execute: argv.includes("--execute") };
}

export function isProtectedJob(job: CleanupJobRow, protectedIds: ProtectedIds): boolean {
  return (
    job.source === "routine_agent" ||
    protectedIds.jobStateIds.has(job.id) ||
    protectedIds.applicationIds.has(job.id) ||
    protectedIds.notificationIds.has(job.id)
  );
}

/**
 * Partitions jobs into preserved, to-delete, and to-archive buckets.
 * Protected rows (job_state, applications, notifications_log, routine_agent)
 * are never selected for deletion or archiving.
 */
export function partitionBloatJobs(
  jobs: readonly CleanupJobRow[],
  protectedIds: ProtectedIds,
  roles: readonly string[],
  options: PartitionOptions = {},
): PartitionResult {
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const nowMs = (options.now ?? new Date()).getTime();
  const cutoffMs = nowMs - maxAgeDays * MS_PER_DAY;

  const preservedIds: string[] = [];
  const toDeleteIds: string[] = [];
  const toArchiveIds: string[] = [];

  for (const job of jobs) {
    if (isProtectedJob(job, protectedIds)) {
      preservedIds.push(job.id);
      continue;
    }

    const overMaxYears = job.min_years !== null && job.min_years > 3;
    const roleMismatch = !jobMatchesRoles({ title: job.title }, roles);

    if (overMaxYears || roleMismatch) {
      toDeleteIds.push(job.id);
      continue;
    }

    const referenceDate = job.posted_at ?? job.first_seen_at;
    const referenceMs = Date.parse(referenceDate);
    if (job.is_active && Number.isFinite(referenceMs) && referenceMs < cutoffMs) {
      toArchiveIds.push(job.id);
    }
  }

  return {
    total: jobs.length,
    preservedIds,
    toDeleteIds,
    toArchiveIds,
  };
}

async function fetchAllJobIdsFromTable(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  table: "job_state" | "applications" | "notifications_log",
): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("job_id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch ${table} job_ids: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (typeof row.job_id === "string" && row.job_id.length > 0) {
        ids.add(row.job_id);
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

async function fetchAllJobs(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<CleanupJobRow[]> {
  const rows: CleanupJobRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, title, source, min_years, is_active, first_seen_at, posted_at")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch jobs: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as CleanupJobRow[]));

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function main(): Promise<void> {
  const { execute } = parseCleanupMode(process.argv.slice(2));
  const rawMaxAge = Number(process.env.CLEANUP_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS);
  const maxAgeDays = Number.isFinite(rawMaxAge) && rawMaxAge > 0 ? rawMaxAge : DEFAULT_MAX_AGE_DAYS;

  console.log(
    `[cleanup-bloat] mode=${execute ? "EXECUTE" : "DRY-RUN"} maxAgeDays=${maxAgeDays}`,
  );

  const supabase = createSupabaseServiceClient();
  const roleRepo = new SupabaseRoleRepository(supabase);
  const activeRole = await roleRepo.getActiveSelection();
  const roles = activeRole?.expandedRoles ?? [];

  const [jobStateIds, applicationIds, notificationIds, jobs] = await Promise.all([
    fetchAllJobIdsFromTable(supabase, "job_state"),
    fetchAllJobIdsFromTable(supabase, "applications"),
    fetchAllJobIdsFromTable(supabase, "notifications_log"),
    fetchAllJobs(supabase),
  ]);

  const result = partitionBloatJobs(
    jobs,
    { jobStateIds, applicationIds, notificationIds },
    roles,
    { maxAgeDays },
  );

  console.log(
    `[cleanup-bloat] summary: total=${result.total} preserved=${result.preservedIds.length} to_delete=${result.toDeleteIds.length} to_archive=${result.toArchiveIds.length}`,
  );

  if (!execute) {
    console.log("[cleanup-bloat] dry-run complete (zero DB writes). Pass --execute to apply.");
    return;
  }

  let deletedCount = 0;
  for (let i = 0; i < result.toDeleteIds.length; i += BATCH_SIZE) {
    const batch = result.toDeleteIds.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("jobs").delete().in("id", batch);
    if (error) {
      throw new Error(`Delete batch failed at offset ${i}: ${error.message}`);
    }
    deletedCount += batch.length;
  }

  let archivedCount = 0;
  for (let i = 0; i < result.toArchiveIds.length; i += BATCH_SIZE) {
    const batch = result.toArchiveIds.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("jobs")
      .update({ is_active: false })
      .in("id", batch);
    if (error) {
      throw new Error(`Archive batch failed at offset ${i}: ${error.message}`);
    }
    archivedCount += batch.length;
  }

  console.log(
    `[cleanup-bloat] execute complete: deleted=${deletedCount} archived=${archivedCount}`,
  );
}

const isEntrypoint =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1].length > 0 &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  main().catch((err) => {
    console.error("[cleanup-bloat] fatal:", err);
    process.exitCode = 1;
  });
}
