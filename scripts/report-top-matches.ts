import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Read-only report: the top-N scored jobs for the active role selection +
// active resume version, in the same overall_score-descending order the
// dashboard uses (SupabaseJobRepository.findForDashboard). Mirrors what
// /dashboard shows, for a quick terminal view. Never writes.
//
// Usage: tsx scripts/report-top-matches.ts [N]   (N defaults to 10)
const DEFAULT_LIMIT = 10;

function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
}

function pct(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

async function main(): Promise<void> {
  const limitArg = Number(process.argv[2]);
  const limit = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : DEFAULT_LIMIT;

  const client = createSupabaseServiceClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);
  const jobRepository = new SupabaseJobRepository(client);

  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("No active role selection — nothing to rank. Set one at /roles.");
    return;
  }

  const activeResume = await resumeRepository.getActive();
  const resumeVersion = activeResume?.version ?? 0;

  // minAiScore: 0 -> only scored jobs (inner join), ordered by overall_score
  // desc then posted_at desc (findForDashboard's default sort).
  const { jobs } = await jobRepository.findForDashboard(roleSelection.id, { minAiScore: 0 }, limit, resumeVersion);

  console.log(`\nTop ${limit} matches — role "${roleSelection.primaryRole}", resume v${resumeVersion}`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(96)}`);
  console.log(`${pad("#", 3)} ${pad("Score", 6)} ${pad("AI", 5)} ${pad("Company", 26)} ${pad("Title", 34)} ${pad("Loc", 9)} Source`);
  console.log(`${"-".repeat(96)}`);

  if (jobs.length === 0) {
    console.log("(no scored jobs yet — run `npm run score`)");
    return;
  }

  jobs.forEach((job, i) => {
    console.log(
      `${pad(String(i + 1), 3)} ${pad(pct(job.overallScore), 6)} ${pad(pct(job.aiScore), 5)} ` +
        `${pad(job.companyName || "—", 26)} ${pad(job.title, 34)} ${pad(job.locationTags.join(",") || "—", 9)} ${job.source}`,
    );
  });
  console.log("");
}

main().catch((err) => {
  console.error("[report-top-matches] fatal error:", err);
  process.exit(1);
});
