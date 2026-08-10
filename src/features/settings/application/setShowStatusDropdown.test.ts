import { describe, expect, it, vi } from "vitest";
import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import { setShowStatusDropdown } from "./setShowStatusDropdown";

function makeRepository(): SettingsRepository {
  return {
    getDesiredExperienceYears: vi.fn(),
    setDesiredExperienceYears: vi.fn().mockResolvedValue(undefined),
    getSkipUnsponsoredForeignJobs: vi.fn(),
    setSkipUnsponsoredForeignJobs: vi.fn().mockResolvedValue(undefined),
    getShowStatusDropdown: vi.fn(),
    setShowStatusDropdown: vi.fn().mockResolvedValue(undefined),
  };
}

describe("setShowStatusDropdown", () => {
  it("delegates to the repository", async () => {
    const settingsRepository = makeRepository();
    await setShowStatusDropdown(false, { settingsRepository });
    expect(settingsRepository.setShowStatusDropdown).toHaveBeenCalledWith(false);
  });
});
