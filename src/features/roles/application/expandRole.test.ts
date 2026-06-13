import { describe, expect, it, vi } from "vitest";
import type { RoleExpansionProvider } from "@/features/roles/domain/RoleExpansionProvider";
import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import { DomainValidationError } from "@/shared/domain/errors";
import { expandRole } from "./expandRole";

function makeRoleRepository(): RoleRepository {
  return {
    getExpansion: vi.fn().mockResolvedValue(null),
    saveExpansion: vi.fn().mockResolvedValue(undefined),
    getActiveSelection: vi.fn(),
    setActiveSelection: vi.fn(),
  };
}

function makeProvider(relatedRoles: string[] = []): RoleExpansionProvider {
  return {
    expand: vi.fn().mockResolvedValue(relatedRoles),
  };
}

describe("expandRole", () => {
  it("returns the cached expansion without calling the AI provider", async () => {
    const roleRepository = makeRoleRepository();
    vi.mocked(roleRepository.getExpansion).mockResolvedValue({
      relatedRoles: ["Frontend Developer", "Backend Developer"],
      source: "seed",
    });
    const expansionProvider = makeProvider();

    const result = await expandRole("Full Stack Developer", { roleRepository, expansionProvider });

    expect(result).toEqual({
      relatedRoles: ["Frontend Developer", "Backend Developer"],
      source: "seed",
    });
    expect(expansionProvider.expand).not.toHaveBeenCalled();
    expect(roleRepository.saveExpansion).not.toHaveBeenCalled();
  });

  it("normalizes the role before checking the cache", async () => {
    const roleRepository = makeRoleRepository();
    const expansionProvider = makeProvider(["Backend Developer"]);

    await expandRole("  Full Stack Developer  ", { roleRepository, expansionProvider });

    expect(roleRepository.getExpansion).toHaveBeenCalledWith("full stack developer");
  });

  it("falls back to the AI provider on a cache miss and caches the result", async () => {
    const roleRepository = makeRoleRepository();
    const expansionProvider = makeProvider(["Frontend Developer", "React Developer"]);

    const result = await expandRole("Full Stack Developer", { roleRepository, expansionProvider });

    expect(expansionProvider.expand).toHaveBeenCalledWith("Full Stack Developer");
    expect(roleRepository.saveExpansion).toHaveBeenCalledWith(
      "full stack developer",
      ["Frontend Developer", "React Developer"],
      "ai",
    );
    expect(result).toEqual({
      relatedRoles: ["Frontend Developer", "React Developer"],
      source: "ai",
    });
  });

  it("throws DomainValidationError for an empty primary role", async () => {
    const roleRepository = makeRoleRepository();
    const expansionProvider = makeProvider();

    await expect(expandRole("   ", { roleRepository, expansionProvider })).rejects.toThrow(
      DomainValidationError,
    );
    expect(roleRepository.getExpansion).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError if the AI provider returns no related roles", async () => {
    const roleRepository = makeRoleRepository();
    const expansionProvider = makeProvider([]);

    await expect(
      expandRole("Some Niche Title", { roleRepository, expansionProvider }),
    ).rejects.toThrow(DomainValidationError);
    expect(roleRepository.saveExpansion).not.toHaveBeenCalled();
  });
});
