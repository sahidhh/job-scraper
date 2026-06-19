import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { validateSources } from "@/features/sources/application/validateSources";
import { SOURCE_HEALTH_CONFIG } from "@/features/sources/domain/sourceHealthConfig";
import type { ValidationGroup, ValidationStatus } from "@/features/sources/domain/sourceValidation";
import { sourceValidators } from "@/features/sources/infrastructure/validators/index";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

const includeDisabled = process.argv.includes("--include-disabled");

function statusIcon(status: ValidationStatus): string {
  return status === "healthy" || status === "redirected" ? "✅" : "❌";
}

function printGroup(group: ValidationGroup): void {
  if (group.results.length === 0) return;

  const heading = group.source.charAt(0).toUpperCase() + group.source.slice(1);
  console.log(`\n## ${heading}\n`);

  for (const r of group.results) {
    const suffix = r.httpStatus !== null ? ` (${r.httpStatus})` : "";
    console.log(`${r.companyName} ${statusIcon(r.status)} ${r.status}${suffix}`);
  }
}

function printSummary(groups: ValidationGroup[], totalDisabled: number): void {
  for (const group of groups) {
    printGroup(group);
  }

  const all = groups.flatMap((g) => g.results);
  const activeHealthy = all.filter((r) => r.status === "healthy" || r.status === "redirected").length;
  const unhealthy = all.filter(
    (r) => r.status !== "healthy" && r.status !== "redirected",
  ).length;
  const totalProbed = all.length;

  console.log("\n## Summary\n");
  console.log(`Active (healthy): ${activeHealthy}`);
  console.log(`Unhealthy:        ${unhealthy}`);
  console.log(`Disabled:         ${totalDisabled}`);
  console.log(`Total probed:     ${totalProbed}  (disabled sources skipped)`);

  const newFailures = all.filter((r) => r.status !== "healthy" && r.status !== "redirected").length;

  if (newFailures > 0) {
    console.log("\n❌ New failures detected — previously-active sources are now broken");
    process.exitCode = 1;
  } else if (activeHealthy < SOURCE_HEALTH_CONFIG.minimumHealthyCount) {
    console.log(
      `\n❌ Healthy source count (${activeHealthy}) dropped below minimum (${SOURCE_HEALTH_CONFIG.minimumHealthyCount})`,
    );
    process.exitCode = 1;
  } else {
    console.log("\n✅ No new failures detected");
  }
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const companyRepository = new SupabaseCompanyRepository(client);

  console.log("[validate-sources] loading configured companies…");
  const companies = await companyRepository.listActive();

  const disabledCompanies = companies.filter((c) => c.healthStatus === "disabled");
  const totalDisabled = disabledCompanies.length;

  const total = companies.filter(
    (c) => c.boardToken !== null && (includeDisabled || c.healthStatus !== "disabled"),
  ).length;
  console.log(`[validate-sources] probing ${total} board(s) across ${sourceValidators.length} ATS source(s)${totalDisabled > 0 ? ` (${totalDisabled} disabled skipped)` : ""}\n`);

  const groups = await validateSources(sourceValidators, companies, companyRepository, includeDisabled);

  printSummary(groups, includeDisabled ? 0 : totalDisabled);
}

main().catch((err) => {
  console.error("[validate-sources] fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
