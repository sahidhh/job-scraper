import { describe, expect, it, vi } from "vitest";
import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import type { JobSource } from "@/shared/domain/enums";
import { DomainValidationError } from "@/shared/domain/errors";
import { setEnabledSources } from "./setEnabledSources";

function makeRepository(): SettingsRepository {
  return {
    getDesiredExperienceYears: vi.fn(),
    setDesiredExperienceYears: vi.fn().mockResolvedValue(undefined),
    getSkipUnsponsoredForeignJobs: vi.fn(),
    setSkipUnsponsoredForeignJobs: vi.fn().mockResolvedValue(undefined),
    getShowStatusDropdown: vi.fn(),
    setShowStatusDropdown: vi.fn().mockResolvedValue(undefined),
    getEnabledSources: vi.fn(),
    setEnabledSources: vi.fn().mockResolvedValue(undefined),
  };
}

describe("setEnabledSources", () => {
  it("delegates valid deduplicated sources to the repository", async () => {
    const settingsRepository = makeRepository();
    await setEnabledSources(["naukri", "naukrigulf", "naukri"], { settingsRepository });
    expect(settingsRepository.setEnabledSources).toHaveBeenCalledWith(["naukri", "naukrigulf"]);
  });

  it("rejects manual or unknown sources with DomainValidationError", async () => {
    const settingsRepository = makeRepository();
    await expect(
      setEnabledSources(["naukri", "careers_url" as JobSource], { settingsRepository }),
    ).rejects.toThrow(DomainValidationError);
    await expect(
      setEnabledSources(["unknown_source" as JobSource], { settingsRepository }),
    ).rejects.toThrow(DomainValidationError);
    expect(settingsRepository.setEnabledSources).not.toHaveBeenCalled();
  });
});
