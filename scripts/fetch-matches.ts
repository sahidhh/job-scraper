import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { hasAnyEnv } from "@/shared/infrastructure/env";
import { SUPABASE_SECRET_KEY_ENV_VARS } from "@/shared/infrastructure/supabaseClient";
import { parseExportArgs, runExportTopMatches } from "./export-top-matches";

// Reusable one-command match fetcher (local SUPABASE_URL + service key if
// present, otherwise dispatches maintenance.yml via `gh`, waits for completion,
// and downloads the `top-matches-export` artifact into `reports/top-matches/`).
//
// Usage: npm run fetch:matches [-- 50] [--location uae] [--remote] [--origin all]
//        [--ref <branch>] [--script <export:matches|report:matches>]

interface GhRunSummary {
  databaseId: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  event: string;
  url: string;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const ARTIFACT_NAME = "top-matches-export";

function parseFetchArgs(argv: readonly string[]): {
  exportArgs: string[];
  refOverride?: string;
  workflowScript: "export:matches" | "report:matches";
} {
  const exportArgs: string[] = [];
  let refOverride: string | undefined;
  let workflowScript: "export:matches" | "report:matches" = "export:matches";

  const rest = argv.slice();
  let token: string | undefined;
  while ((token = rest.shift()) !== undefined) {
    if (token === "--ref") {
      const val = rest.shift();
      if (!val) throw new Error("--ref requires a branch or tag name");
      refOverride = val;
    } else if (token === "--script") {
      const val = rest.shift();
      if (val !== "export:matches" && val !== "report:matches") {
        throw new Error("--script must be export:matches or report:matches");
      }
      workflowScript = val;
    } else {
      exportArgs.push(token);
    }
  }

  return { exportArgs, refOverride, workflowScript };
}

function runCommand(cmd: string, args: readonly string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function listRecentMaintenanceRuns(branch: string): GhRunSummary[] {
  const raw = runCommand("gh", [
    "run",
    "list",
    "--workflow",
    "maintenance.yml",
    "--branch",
    branch,
    "--limit",
    "10",
    "--json",
    "databaseId,status,conclusion,createdAt,event,url",
  ]);
  return JSON.parse(raw) as GhRunSummary[];
}

async function fetchViaGitHubActions(
  branch: string,
  outDir: string,
  workflowScript: "export:matches" | "report:matches",
): Promise<void> {
  const knownIds = new Set(listRecentMaintenanceRuns(branch).map((r) => r.databaseId));
  const dispatchStartedAt = Date.now() - 10_000;

  console.log(`[fetch-matches] Dispatching maintenance.yml (${workflowScript}) on ref "${branch}"...`);
  runCommand("gh", [
    "workflow",
    "run",
    "maintenance.yml",
    "--ref",
    branch,
    "-f",
    `script=${workflowScript}`,
  ]);

  let targetRun: GhRunSummary | undefined;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const runs = listRecentMaintenanceRuns(branch);
    if (!targetRun) {
      targetRun = runs.find(
        (r) =>
          r.event === "workflow_dispatch" &&
          (!knownIds.has(r.databaseId) || new Date(r.createdAt).getTime() >= dispatchStartedAt),
      );
    } else {
      targetRun = runs.find((r) => r.databaseId === targetRun!.databaseId) ?? targetRun;
    }

    if (targetRun) {
      if (targetRun.status === "completed") {
        if (targetRun.conclusion !== "success") {
          throw new Error(
            `GitHub Actions run ${targetRun.databaseId} finished with conclusion="${targetRun.conclusion}". See: ${targetRun.url}`,
          );
        }
        break;
      }
      console.log(`[fetch-matches] Run ${targetRun.databaseId} status: ${targetRun.status}...`);
    } else {
      console.log("[fetch-matches] Waiting for GitHub Actions run to appear...");
    }

    await delay(POLL_INTERVAL_MS);
  }

  if (!targetRun || targetRun.status !== "completed") {
    throw new Error("Timed out waiting for maintenance.yml run to complete.");
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  console.log(`[fetch-matches] Downloading "${ARTIFACT_NAME}" from run ${targetRun.databaseId} into ${outDir}/...`);
  runCommand("gh", [
    "run",
    "download",
    String(targetRun.databaseId),
    "-n",
    ARTIFACT_NAME,
    "-D",
    outDir,
  ]);
  console.log(`[fetch-matches] Done. Files saved under ${outDir}/ (latest.xlsx, latest.csv, latest.json, latest.md).`);
}

async function main(): Promise<void> {
  const { exportArgs, refOverride, workflowScript } = parseFetchArgs(process.argv.slice(2));
  const exportOptions = parseExportArgs(exportArgs);

  const hasLocalServiceCreds =
    hasAnyEnv("SUPABASE_URL") && hasAnyEnv(...SUPABASE_SECRET_KEY_ENV_VARS);

  if (hasLocalServiceCreds) {
    console.log("[fetch-matches] Local Supabase credentials detected; running export directly...");
    await runExportTopMatches(exportOptions);
    return;
  }

  const branch = refOverride ?? (runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]) || "main");
  await fetchViaGitHubActions(branch, exportOptions.outDir, workflowScript);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/fetch-matches.ts")) {
  main().catch((err) => {
    console.error("[fetch-matches] error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
