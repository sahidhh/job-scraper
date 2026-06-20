import type { CompanyRepository } from "@/features/companies/domain/CompanyRepository";
import type { Company } from "@/features/companies/domain/types";
import type { ProbeOutcome, SourceValidator, ValidationGroup, ValidationResult } from "@/features/sources/domain/sourceValidation";
import { SOURCE_HEALTH_CONFIG } from "@/features/sources/domain/sourceHealthConfig";

const FAILURE_STATUSES = new Set(["not_found", "unauthorized", "rate_limited", "unknown"]);

async function applyHealthUpdate(
  company: Company,
  result: ValidationResult,
  companyRepository: CompanyRepository,
): Promise<void> {
  const now = new Date().toISOString();

  if (FAILURE_STATUSES.has(result.status)) {
    const consecutiveFailures = company.consecutiveFailures + 1;
    const healthStatus =
      consecutiveFailures >= SOURCE_HEALTH_CONFIG.disableAfterConsecutiveFailures
        ? "disabled"
        : "unhealthy";
    await companyRepository.updateHealth(company.id, {
      healthStatus,
      consecutiveFailures,
      lastFailureAt: now,
    });
  } else {
    await companyRepository.updateHealth(company.id, {
      healthStatus: "active",
      consecutiveFailures: 0,
      lastSuccessAt: now,
    });
  }
}

// Runs all registered validators in parallel, grouping results by source.
// Each source's boards are probed concurrently to minimise wall-clock time.
// Only companies that are active AND have a boardToken are probed.
// Companies with healthStatus === 'disabled' are skipped unless --include-disabled is set.
export async function validateSources(
  validators: readonly SourceValidator[],
  companies: readonly Company[],
  companyRepository: CompanyRepository,
  includeDisabled = false,
): Promise<ValidationGroup[]> {
  return Promise.all(
    validators.map(async (validator) => {
      const matching = companies.filter(
        (c) =>
          c.source === validator.source &&
          c.active &&
          c.boardToken !== null &&
          (includeDisabled || c.healthStatus !== "disabled"),
      );
      const results = await Promise.all(
        matching.map(async (c): Promise<ProbeOutcome> => {
          const previousHealthStatus = c.healthStatus;
          const result = await validator.validate(c.boardToken!, c.name);
          await applyHealthUpdate(c, result, companyRepository);
          return { ...result, previousHealthStatus };
        }),
      );
      return { source: validator.source, results };
    }),
  );
}
