import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import { JOB_SOURCES, type JobSource } from "@/shared/domain/enums";
import { DomainValidationError } from "@/shared/domain/errors";

export interface SetEnabledSourcesDeps {
  settingsRepository: SettingsRepository;
}

const VALID_JOB_SOURCES = new Set<string>(JOB_SOURCES);

/**
 * Validate and persist the list of enabled job sources for scheduled scraping.
 */
export async function setEnabledSources(
  sources: JobSource[],
  deps: SetEnabledSourcesDeps,
): Promise<void> {
  for (const source of sources) {
    if (!VALID_JOB_SOURCES.has(source)) {
      throw new DomainValidationError(`Invalid job source: ${source}`);
    }
  }

  const uniqueSources = [...new Set(sources)];
  await deps.settingsRepository.setEnabledSources(uniqueSources);
}
