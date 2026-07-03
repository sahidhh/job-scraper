import type { JobSource } from "@/shared/domain/enums";
import type { ScrapeRunRepository } from "@/features/sources/domain/ScrapeRunRepository";
import type { NewScrapeRun, ScrapeRun } from "@/features/sources/domain/types";
import type { FailureCategory } from "@/features/sources/domain/classifyScrapeFailure";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database, Json } from "../../../../supabase/database.types";

type ScrapeRunRow = Database["public"]["Tables"]["scrape_runs"]["Row"];

function toScrapeRun(row: ScrapeRunRow): ScrapeRun {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    foundCount: row.found_count,
    keptCount: row.kept_count,
    insertedCount: row.inserted_count,
    updatedCount: row.updated_count,
    duplicateCount: row.duplicate_count,
    failedCount: row.failed_count,
    failureCategory: row.failure_category as FailureCategory | null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    error: row.error,
    metadata: row.metadata as Record<string, unknown> | null,
    runAt: row.run_at,
  };
}

// repositories.md §7.
export class SupabaseScrapeRunRepository implements ScrapeRunRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async recordRun(run: NewScrapeRun): Promise<void> {
    const { error } = await this.client.from("scrape_runs").insert({
      source: run.source,
      status: run.status,
      found_count: run.foundCount,
      kept_count: run.keptCount ?? null,
      inserted_count: run.insertedCount ?? null,
      updated_count: run.updatedCount ?? null,
      duplicate_count: run.duplicateCount ?? null,
      failed_count: run.failedCount ?? 0,
      failure_category: run.failureCategory ?? null,
      started_at: run.startedAt ?? null,
      completed_at: run.completedAt ?? null,
      duration_ms: run.durationMs ?? null,
      error: run.error ?? null,
      metadata: (run.metadata ?? null) as Json | null,
    });

    if (error) throw toAppError(error);
  }

  async listRecent(limit: number): Promise<ScrapeRun[]> {
    const { data, error } = await this.client
      .from("scrape_runs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(limit);

    if (error) throw toAppError(error);
    return (data ?? []).map(toScrapeRun);
  }

  async listRecentBySource(source: JobSource, limit: number): Promise<ScrapeRun[]> {
    const { data, error } = await this.client
      .from("scrape_runs")
      .select("*")
      .eq("source", source)
      .order("run_at", { ascending: false })
      .limit(limit);

    if (error) throw toAppError(error);
    return (data ?? []).map(toScrapeRun);
  }
}
