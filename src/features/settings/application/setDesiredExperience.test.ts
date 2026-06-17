import { describe, expect, it, vi } from "vitest";
import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import { DomainValidationError } from "@/shared/domain/errors";
import { setDesiredExperience } from "./setDesiredExperience";

function makeRepository(): SettingsRepository {
  return {
    getDesiredExperienceYears: vi.fn(),
    setDesiredExperienceYears: vi.fn().mockResolvedValue(undefined),
  };
}

describe("setDesiredExperience", () => {
  it("delegates a valid value to the repository", async () => {
    const settingsRepository = makeRepository();
    await setDesiredExperience(3, { settingsRepository });
    expect(settingsRepository.setDesiredExperienceYears).toHaveBeenCalledWith(3);
  });

  it("allows null to clear the setting", async () => {
    const settingsRepository = makeRepository();
    await setDesiredExperience(null, { settingsRepository });
    expect(settingsRepository.setDesiredExperienceYears).toHaveBeenCalledWith(null);
  });

  it("rejects non-integers", async () => {
    const settingsRepository = makeRepository();
    await expect(setDesiredExperience(2.5, { settingsRepository })).rejects.toThrow(DomainValidationError);
    expect(settingsRepository.setDesiredExperienceYears).not.toHaveBeenCalled();
  });

  it("rejects out-of-range values", async () => {
    const settingsRepository = makeRepository();
    await expect(setDesiredExperience(-1, { settingsRepository })).rejects.toThrow(DomainValidationError);
    await expect(setDesiredExperience(99, { settingsRepository })).rejects.toThrow(DomainValidationError);
  });
});
