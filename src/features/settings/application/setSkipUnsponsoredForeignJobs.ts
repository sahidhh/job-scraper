import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";

export interface SetSkipUnsponsoredForeignJobsDeps {
  settingsRepository: SettingsRepository;
}

/**
 * Persist whether the scrape pipeline should discard foreign onsite/hybrid
 * postings that explicitly refuse visa sponsorship (AD-50). No validation
 * needed beyond the boolean the type system already enforces -- unlike
 * setDesiredExperience there is no range to check.
 */
export async function setSkipUnsponsoredForeignJobs(
  enabled: boolean,
  deps: SetSkipUnsponsoredForeignJobsDeps,
): Promise<void> {
  await deps.settingsRepository.setSkipUnsponsoredForeignJobs(enabled);
}
