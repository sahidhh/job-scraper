import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";

export interface SetShowStatusDropdownDeps {
  settingsRepository: SettingsRepository;
}

/**
 * Persist whether the dashboard's per-job status control renders as an
 * interactive dropdown/sheet or a read-only badge. No validation needed
 * beyond the boolean the type system already enforces.
 */
export async function setShowStatusDropdown(
  enabled: boolean,
  deps: SetShowStatusDropdownDeps,
): Promise<void> {
  await deps.settingsRepository.setShowStatusDropdown(enabled);
}
