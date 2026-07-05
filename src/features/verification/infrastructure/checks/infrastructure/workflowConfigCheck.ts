import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckOutcome, CheckSeverity, CheckStatus } from "@/features/verification/domain/types";

function hasActiveSchedule(yaml: string): boolean {
  return /^\s*schedule:/m.test(yaml) && !/^\s*#\s*schedule:/m.test(yaml);
}

/**
 * Structural, local-file-only check (no network) of the GitHub Actions
 * workflows this project depends on -- confirms the cron pipeline
 * references the secrets it needs and reports whether the recurring
 * schedule is live. Deliberately does not assert an *expected* schedule
 * state: TECHNICAL_DEBT.md #1 already documents that some older docs
 * describe the schedule as "commented out pending go-live approval" while
 * `scrape.yml` has actually had it active for a while -- this check just
 * reports the current fact rather than repeating that stale assumption.
 */
// requiredScrapeSecrets is supplied by the composition root
// (scripts/verify-production.ts) rather than hardcoded here -- keeps this
// file free of the service-role secret's env var name, which
// check:service-role-boundary (AD-12) restricts to scripts/** and
// supabaseClient.ts.
export function workflowConfigCheck(requiredScrapeSecrets: readonly string[]): Check {
  return {
    id: "infra.scheduler-config",
    name: "Scheduler / CI workflow configuration",
    category: "infrastructure",
    // The realistic worst case here (a missing secret reference silently
    // breaking the whole cron pipeline) is high-impact; individual warning
    // findings below are downgraded per-outcome via severityOverride.
    severity: "high",
    async run(): Promise<CheckOutcome> {
      const root = process.cwd();
      const details: string[] = [];
      let status: CheckStatus = "pass";
      let probableCause: string | undefined;
      let suggestedFix: string | undefined;
      let severityOverride: CheckSeverity | undefined;

      let scrapeYml: string;
      try {
        scrapeYml = readFileSync(join(root, ".github/workflows/scrape.yml"), "utf8");
      } catch (err) {
        return {
          status: "warning",
          summary: `Could not read .github/workflows/scrape.yml: ${err instanceof Error ? err.message : String(err)}`,
          affectedSubsystem: "GitHub Actions CI",
          severityOverride: "medium",
        };
      }

      const scheduleActive = hasActiveSchedule(scrapeYml);
      details.push(`scrape.yml cron schedule: ${scheduleActive ? "active" : "commented out / manual dispatch only"}`);
      if (!scheduleActive) {
        status = "warning";
        probableCause = "The cron schedule may be deliberately disabled pending a go-live decision, or was never enabled.";
        suggestedFix = "Confirm with the project owner whether the pipeline is meant to run on a schedule; see docs/agent-workflow.md.";
        severityOverride = "low"; // a business decision, not a defect, until proven otherwise below
      }

      const missingSecretRefs = requiredScrapeSecrets.filter((s) => !scrapeYml.includes(s));
      if (missingSecretRefs.length > 0) {
        status = "fail";
        details.push(`scrape.yml missing secret references: ${missingSecretRefs.join(", ")}`);
        probableCause = "scrape.yml was edited without updating its `env:` block for one of the scrape/score/notify steps.";
        suggestedFix = `Add the missing secret reference(s) to scrape.yml: ${missingSecretRefs.join(", ")}.`;
        severityOverride = undefined; // real fail — use the check's base "high" severity, not a downgraded one
      }

      try {
        readFileSync(join(root, ".github/workflows/validate-sources.yml"), "utf8");
        details.push("validate-sources.yml present");
      } catch {
        details.push("validate-sources.yml not found");
        if (status !== "fail") {
          status = "warning";
          probableCause = (probableCause ? probableCause + " Also, " : "") + "validate-sources.yml is missing from .github/workflows/.";
          suggestedFix = "Restore validate-sources.yml so board-token health can be probed on its weekly schedule.";
          // A missing workflow file is a more concrete gap than an
          // undecided schedule, so it takes priority if both are present.
          severityOverride = "medium";
        }
      }

      return {
        status,
        summary: status === "pass" ? "GitHub Actions workflow configuration looks consistent" : "Workflow configuration needs review",
        details,
        probableCause,
        suggestedFix,
        affectedSubsystem: "GitHub Actions CI / cron pipeline",
        severityOverride,
      };
    },
  };
}
