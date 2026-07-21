import type { JobFilters } from "@/features/jobs/domain/types";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SCORING_QUEUE_CONFIG } from "@/features/scoring/domain/scoringQueueConfig";
import { LOCATION_TAGS, type LocationTag } from "@/shared/domain/enums";
import { optionalEnv } from "@/shared/infrastructure/env";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

// Read-only report: the top-N scored jobs for the active role selection +
// active resume version, ranked by overall_score desc -- the same ranking
// /dashboard shows (SupabaseJobRepository.findForDashboard orders correctly as
// of AD-49). Optional filters mirror the dashboard's. Never writes.
//
// Usage: tsx scripts/report-top-matches.ts [N] [--location <india|singapore|uae|remote>] [--remote]
//   e.g. npm run report:matches -- 15 --location uae
//        npm run report:matches -- --remote
// (--sponsoring was removed with the filter it wrapped -- AD-50.)
const DEFAULT_LIMIT = 10;

function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
}

function pct(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

interface ParsedArgs {
  limit: number;
  filters: JobFilters;
  label: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let limit = DEFAULT_LIMIT;
  // minAiScore: 0 -> scored jobs only (unscored have no rank to report).
  const filters: JobFilters = { minAiScore: 0 };
  const labels: string[] = [];

  const rest = argv.slice();
  let token: string | undefined;
  while ((token = rest.shift()) !== undefined) {
    if (token === "--location") {
      const tag = (rest.shift() ?? "").toLowerCase();
      if (!(LOCATION_TAGS as readonly string[]).includes(tag)) {
        console.error(`--location must be one of: ${LOCATION_TAGS.join(", ")}`);
        process.exit(1);
      }
      filters.locationTags = [tag as LocationTag];
      labels.push(tag);
    } else if (token === "--remote") {
      filters.remoteOnly = true;
      labels.push("remote");
    } else if (token === "--sponsoring") {
      // AD-50 removed the filter this flag was built on: it required an
      // explicit "visa sponsorship" phrase in the posting (null for nearly
      // every job) and excluded India roles, which need no sponsorship. The
      // report is already restricted to AI-scored jobs, and jobs the
      // candidate can't apply to never get an AI score, so this list is
      // eligibility-filtered by construction -- there is nothing left for
      // the flag to narrow.
      console.error(
        "--sponsoring was removed (docs/decisions.md AD-50). Scored jobs are already eligibility-filtered;\n" +
          "for a confirmed-sponsorship signal, see the sponsorship ranking bonus in Settings → Ranking.",
      );
      process.exit(1);
    } else if (/^\d+$/.test(token)) {
      limit = Number(token);
    } else {
      console.error(`Unknown argument: "${token}"`);
      process.exit(1);
    }
  }

  return { limit, filters, label: labels.length > 0 ? ` [${labels.join(", ")}]` : "" };
}

async function main(): Promise<void> {
  const { limit, filters, label } = parseArgs(process.argv.slice(2));

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

  const { jobs } = await jobRepository.findForDashboard(
    roleSelection.id,
    filters,
    limit,
    resumeVersion,
    // Both only feed the JobStats breakdown, which this report ignores -- but
    // keep them consistent with score.ts so the values are never misleading.
    Number(optionalEnv("KEYWORD_THRESHOLD", "0.25")),
    SCORING_QUEUE_CONFIG.maxAiRetries,
  );

  console.log(`\nTop ${limit} matches${label} — role "${roleSelection.primaryRole}", resume v${resumeVersion}`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(96)}`);
  console.log(`${pad("#", 3)} ${pad("Score", 6)} ${pad("AI", 5)} ${pad("Company", 26)} ${pad("Title", 34)} ${pad("Loc", 9)} Source`);
  console.log(`${"-".repeat(96)}`);

  if (jobs.length === 0) {
    console.log(`(no scored jobs match${label} — try widening the filter, or run \`npm run score\`)`);
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
