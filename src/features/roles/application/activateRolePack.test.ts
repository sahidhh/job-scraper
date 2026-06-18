import { describe, expect, it, vi } from "vitest";
import type { RolePackRepository } from "@/features/roles/domain/RolePackRepository";
import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import type { RolePack, RoleSelection } from "@/features/roles/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { activateRolePack } from "./activateRolePack";

function makePack(overrides: Partial<RolePack> = {}): RolePack {
  return {
    id: "pack-1",
    name: "Full Stack Pack",
    description: "Full stack roles",
    roles: ["Full Stack Engineer", "React Developer", "Node.js Developer"],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRolePackRepository(pack: RolePack | null = makePack()): RolePackRepository {
  return {
    getAll: vi.fn(),
    getById: vi.fn().mockResolvedValue(pack),
  };
}

function makeRoleRepository(selection: Partial<RoleSelection> = {}): RoleRepository {
  const defaultSelection: RoleSelection = {
    id: "sel-1",
    primaryRole: "Full Stack Pack",
    expandedRoles: ["Full Stack Engineer", "React Developer", "Node.js Developer"],
    createdAt: "2026-01-01T00:00:00Z",
    isActive: true,
    ...selection,
  };
  return {
    getExpansion: vi.fn(),
    saveExpansion: vi.fn(),
    getActiveSelection: vi.fn(),
    setActiveSelection: vi.fn().mockResolvedValue(defaultSelection),
  };
}

describe("activateRolePack", () => {
  it("activates the pack by calling setActiveSelection with the pack name and roles", async () => {
    const pack = makePack();
    const rolePackRepository = makeRolePackRepository(pack);
    const roleRepository = makeRoleRepository();

    const result = await activateRolePack("pack-1", { rolePackRepository, roleRepository });

    expect(rolePackRepository.getById).toHaveBeenCalledWith("pack-1");
    expect(roleRepository.setActiveSelection).toHaveBeenCalledWith(
      "Full Stack Pack",
      ["Full Stack Engineer", "React Developer", "Node.js Developer"],
    );
    expect(result.primaryRole).toBe("Full Stack Pack");
    expect(result.isActive).toBe(true);
  });

  it("throws DomainValidationError for an empty packId", async () => {
    const rolePackRepository = makeRolePackRepository();
    const roleRepository = makeRoleRepository();

    await expect(activateRolePack("  ", { rolePackRepository, roleRepository })).rejects.toThrow(
      DomainValidationError,
    );
    expect(rolePackRepository.getById).not.toHaveBeenCalled();
  });

  it("throws DomainValidationError when the pack does not exist", async () => {
    const rolePackRepository = makeRolePackRepository(null);
    const roleRepository = makeRoleRepository();

    await expect(
      activateRolePack("nonexistent-id", { rolePackRepository, roleRepository }),
    ).rejects.toThrow(DomainValidationError);
    expect(roleRepository.setActiveSelection).not.toHaveBeenCalled();
  });
});
