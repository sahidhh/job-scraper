import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckOutcome, CheckStatus } from "@/features/verification/domain/types";

function hasActiveSchedule(yaml: string): boolean {
  return /^\s*schedule:/m.test(yaml) && !/^\s*#\s*schedule:/m.test(yaml);
}

/**
 * Structural, local-file-only check (no network) of the GitHub Actions
 * workflows this project depends on -- confirms the cron pipeline
 * references the secrets it needs and reports whether the recurring
 * schedule is live (docs/agent-workflow.md: intentionally commented out
 * pending go-live approval, so "inactive" is a warning, not a failure).
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
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      const root = process.cwd();
      const details: string[] = [];
      let status: CheckStatus = "pass";
      let recommendation: string | undefined;

      let scrapeYml: string;
      try {
        scrapeYml = readFileSync(join(root, ".github/workflows/scrape.yml"), "utf8");
      } catch (err) {
        return { status: "warning", summary: `Could not read .github/workflows/scrape.yml: ${err instanceof Error ? err.message : String(err)}` };
      }

      const scheduleActive = hasActiveSchedule(scrapeYml);
      details.push(`scrape.yml cron schedule: ${scheduleActive ? "active" : "commented out / manual dispatch only"}`);
      if (!scheduleActive) {
        status = "warning";
        recommendation = "scrape.yml has no active cron schedule — confirm this is intentional pending go-live approval.";
      }

      const missingSecretRefs = requiredScrapeSecrets.filter((s) => !scrapeYml.includes(s));
      if (missingSecretRefs.length > 0) {
        status = "fail";
        details.push(`scrape.yml missing secret references: ${missingSecretRefs.join(", ")}`);
        recommendation = "scrape.yml is missing expected secret references — verify the workflow wiring.";
      }

      try {
        readFileSync(join(root, ".github/workflows/validate-sources.yml"), "utf8");
        details.push("validate-sources.yml present");
      } catch {
        details.push("validate-sources.yml not found");
        if (status === "pass") status = "warning";
      }

      return {
        status,
        summary: status === "pass" ? "GitHub Actions workflow configuration looks consistent" : "Workflow configuration needs review",
        details,
        recommendation,
      };
    },
  };
}
