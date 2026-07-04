import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runChecks } from "@/features/verification/application/runChecks";
import { computeHealthScore } from "@/features/verification/application/computeHealthScore";
import { formatConsoleReport } from "@/features/verification/application/formatConsoleReport";
import { formatMarkdownReport } from "@/features/verification/application/formatMarkdownReport";
import { formatJsonReport } from "@/features/verification/application/formatJsonReport";
import type { Check } from "@/features/verification/domain/types";

import { envVarsCheck } from "@/features/verification/infrastructure/checks/infrastructure/envVarsCheck";
import { supabaseConnectivityCheck } from "@/features/verification/infrastructure/checks/infrastructure/supabaseConnectivityCheck";
import { migrationsCheck } from "@/features/verification/infrastructure/checks/infrastructure/migrationsCheck";
import { rlsCheck } from "@/features/verification/infrastructure/checks/infrastructure/rlsCheck";
import { storageCheck } from "@/features/verification/infrastructure/checks/infrastructure/storageCheck";
import { workflowConfigCheck } from "@/features/verification/infrastructure/checks/infrastructure/workflowConfigCheck";

import { createSourceHealthChecks } from "@/features/verification/infrastructure/checks/application/sourceHealthChecks";
import { createScoringQueueCheck } from "@/features/verification/infrastructure/checks/application/scoringQueueCheck";
import { duplicatePipelineCheck } from "@/features/verification/infrastructure/checks/application/duplicatePipelineCheck";
import { notificationPipelineCheck } from "@/features/verification/infrastructure/checks/application/notificationPipelineCheck";
import { dashboardReachabilityCheck } from "@/features/verification/infrastructure/checks/application/dashboardReachabilityCheck";
import { extractionServicesCheck } from "@/features/verification/infrastructure/checks/application/extractionServicesCheck";
import { activeSingletonsCheck } from "@/features/verification/infrastructure/checks/application/activeSingletonsCheck";

import { openRouterConnectivityCheck } from "@/features/verification/infrastructure/checks/external/openRouterCheck";
import { telegramConnectivityCheck } from "@/features/verification/infrastructure/checks/external/telegramCheck";
import { sourceFallbackConfigCheck } from "@/features/verification/infrastructure/checks/external/sourceFallbackConfigCheck";

import { duplicateFingerprintsCheck } from "@/features/verification/infrastructure/checks/dataQuality/duplicateFingerprintsCheck";
import { missingRequiredFieldsCheck } from "@/features/verification/infrastructure/checks/dataQuality/missingFieldsCheck";
import { invalidSalaryDataCheck } from "@/features/verification/infrastructure/checks/dataQuality/invalidSalaryCheck";
import { invalidEmailsCheck } from "@/features/verification/infrastructure/checks/dataQuality/invalidEmailsCheck";
import { brokenCareerUrlsCheck } from "@/features/verification/infrastructure/checks/dataQuality/brokenCareerUrlsCheck";
import { inconsistentAiScoresCheck } from "@/features/verification/infrastructure/checks/dataQuality/inconsistentScoresCheck";
import { staleJobsCheck } from "@/features/verification/infrastructure/checks/dataQuality/staleJobsCheck";
import { queueIntegrityCheck } from "@/features/verification/infrastructure/checks/dataQuality/queueIntegrityCheck";

import { createSupabaseServiceClient, type TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { optionalEnv } from "@/shared/infrastructure/env";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import { SupabaseScoreRepository } from "@/features/scoring/infrastructure/SupabaseScoreRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { SupabaseResumeRepository } from "@/features/resume/infrastructure/SupabaseResumeRepository";
import { getSourceHealthReport } from "@/features/sources/application/getSourceHealthReport";
import { getScoringQueueReport } from "@/features/scoring/application/getScoringQueueReport";
import type { ScoringQueueSummary } from "@/features/scoring/application/computeScoringQueueSummary";

// Production Verification Framework composition root (v1.4 mission). Wires
// existing repositories/report functions into the generic Check[] the
// framework runs -- no check re-derives logic that already lives in
// scripts/doctor.ts, getSourceHealthReport, or getScoringQueueReport.

function parseFormat(argv: string[]): "console" | "all" {
  const arg = argv.find((a) => a.startsWith("--format="))?.split("=")[1];
  return arg === "console" ? "console" : "all";
}

function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (!cached) cached = fn();
    return cached;
  };
}

function buildClient(): TypedSupabaseClient | null {
  try {
    return createSupabaseServiceClient();
  } catch {
    // envVarsCheck / supabaseConnectivityCheck already surface this as a
    // finding; every other check degrades to "skipped" rather than throwing.
    return null;
  }
}

function buildQueueFetcher(client: TypedSupabaseClient): () => Promise<ScoringQueueSummary | null> {
  const scoreRepository = new SupabaseScoreRepository(client);
  const roleRepository = new SupabaseRoleRepository(client);
  const resumeRepository = new SupabaseResumeRepository(client);

  return memoize(async () => {
    const [resume, roleSelection] = await Promise.all([resumeRepository.getActive(), roleRepository.getActiveSelection()]);
    if (!resume || !roleSelection) return null;
    const keywordThreshold = Number(optionalEnv("KEYWORD_THRESHOLD", "0.25"));
    return getScoringQueueReport({
      scoreRepository,
      roleSelectionId: roleSelection.id,
      resumeVersion: resume.version,
      keywordThreshold,
    });
  });
}

// Kept in scripts/ (allowlisted by check:service-role-boundary, AD-12)
// rather than inside src/features/verification, which must stay free of
// the literal secret-name strings.
const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const OPTIONAL_ENV_VARS = [
  { name: "KEYWORD_THRESHOLD", fallback: "defaults to 0.25" },
  { name: "NOTIFY_THRESHOLD", fallback: "defaults to 0.75" },
  { name: "NOTIFY_MODE", fallback: "defaults to individual" },
  { name: "APP_URL", fallback: "digest \"open dashboard\" links will be omitted" },
  { name: "WELLFOUND_FEED_URL", fallback: "Wellfound adapter auto-disables" },
];

const REQUIRED_SCRAPE_WORKFLOW_SECRETS = ["SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];

function buildChecks(client: TypedSupabaseClient | null): Check[] {
  const checks: Check[] = [
    envVarsCheck(REQUIRED_ENV_VARS, OPTIONAL_ENV_VARS),
    supabaseConnectivityCheck(client),
    migrationsCheck(client),
    rlsCheck(),
    storageCheck(client),
    workflowConfigCheck(REQUIRED_SCRAPE_WORKFLOW_SECRETS),

    duplicatePipelineCheck(client),
    notificationPipelineCheck(client),
    dashboardReachabilityCheck(client),
    extractionServicesCheck(),
    activeSingletonsCheck(client),

    openRouterConnectivityCheck(),
    telegramConnectivityCheck(),
    sourceFallbackConfigCheck(),

    duplicateFingerprintsCheck(client),
    missingRequiredFieldsCheck(client),
    invalidSalaryDataCheck(client),
    invalidEmailsCheck(client),
    brokenCareerUrlsCheck(client),
    inconsistentAiScoresCheck(client),
    staleJobsCheck(client),
    queueIntegrityCheck(client),
  ];

  if (client) {
    const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
    const getHealthReport = memoize(() => getSourceHealthReport(scrapeRunRepository));
    checks.push(...createSourceHealthChecks(getHealthReport));
    checks.push(createScoringQueueCheck(buildQueueFetcher(client)));
  }

  return checks;
}

async function main(): Promise<void> {
  const format = parseFormat(process.argv.slice(2));
  const client = buildClient();

  const checks = buildChecks(client);
  const run = await runChecks(checks);
  const health = computeHealthScore(run.results);

  console.log(formatConsoleReport(run, health));

  if (format === "all") {
    const outDir = join(process.cwd(), "verification-reports");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "latest.md"), formatMarkdownReport(run, health));
    writeFileSync(join(outDir, "latest.json"), formatJsonReport(run, health));
    console.log(`\nReports written to ${outDir}/latest.md and ${outDir}/latest.json`);
  }

  if (health.verdict === "not_ready") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[verify-production] fatal error:", err);
  process.exit(1);
});
