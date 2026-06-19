import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import { validateSources } from "@/features/sources/application/validateSources";
import type { ValidationGroup, ValidationStatus } from "@/features/sources/domain/sourceValidation";
import { sourceValidators } from "@/features/sources/infrastructure/validators/index";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";

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

function printSummary(groups: ValidationGroup[]): void {
  for (const group of groups) {
    printGroup(group);
  }

  const all = groups.flatMap((g) => g.results);
  const healthy = all.filter((r) => r.status === "healthy" || r.status === "redirected").length;
  const broken = all.length - healthy;

  console.log("\n## Summary\n");
  console.log(`Healthy: ${healthy}`);
  console.log(`Broken:  ${broken}`);

  if (broken > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const companyRepository = new SupabaseCompanyRepository(client);

  console.log("[validate-sources] loading configured companies…");
  const companies = await companyRepository.listActive();

  const total = companies.filter((c) => c.boardToken !== null).length;
  console.log(`[validate-sources] probing ${total} board(s) across ${sourceValidators.length} ATS source(s)\n`);

  const groups = await validateSources(sourceValidators, companies);

  printSummary(groups);
}

main().catch((err) => {
  console.error("[validate-sources] fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
