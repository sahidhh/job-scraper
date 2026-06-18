import type { ScrapeRunRepository } from "@/features/sources/domain/ScrapeRunRepository";
import type { NewScrapeRun, ScrapeRun } from "@/features/sources/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database } from "../../../../supabase/database.types";

type ScrapeRunRow = Database["public"]["Tables"]["scrape_runs"]["Row"];

function toScrapeRun(row: ScrapeRunRow): ScrapeRun {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    jobsFound: row.jobs_found,
    error: row.error,
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
      jobs_found: run.jobsFound,
      error: run.error ?? null,
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
}
