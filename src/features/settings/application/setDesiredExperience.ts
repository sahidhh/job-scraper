import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import { validateExperienceYears } from "@/features/settings/domain/validation";

export interface SetDesiredExperienceDeps {
  settingsRepository: SettingsRepository;
}

/**
 * Persist the desired max years of experience used by the dashboard's soft
 * filter (P2). Validates then delegates; null clears the setting.
 */
export async function setDesiredExperience(
  years: number | null,
  deps: SetDesiredExperienceDeps,
): Promise<void> {
  validateExperienceYears(years);
  await deps.settingsRepository.setDesiredExperienceYears(years);
}
