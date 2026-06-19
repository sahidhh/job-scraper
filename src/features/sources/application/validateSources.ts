import type { Company } from "@/features/companies/domain/types";
import type { SourceValidator, ValidationGroup } from "@/features/sources/domain/sourceValidation";

// Runs all registered validators in parallel, grouping results by source.
// Each source's boards are probed concurrently to minimise wall-clock time.
// Only companies that are active AND have a boardToken are probed.
export async function validateSources(
  validators: readonly SourceValidator[],
  companies: readonly Company[],
): Promise<ValidationGroup[]> {
  return Promise.all(
    validators.map(async (validator) => {
      const matching = companies.filter(
        (c) => c.source === validator.source && c.active && c.boardToken !== null,
      );
      const results = await Promise.all(
        matching.map((c) => validator.validate(c.boardToken!, c.name)),
      );
      return { source: validator.source, results };
    }),
  );
}
