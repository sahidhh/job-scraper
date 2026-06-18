import { describe, expect, it, vi } from "vitest";
import type { RolePackRepository } from "@/features/roles/domain/RolePackRepository";
import type { RolePack } from "@/features/roles/domain/types";
import { getRolePacks } from "./getRolePacks";

function makePack(overrides: Partial<RolePack> = {}): RolePack {
  return {
    id: "pack-1",
    name: "Full Stack Pack",
    description: "Full stack roles",
    roles: ["Full Stack Engineer", "React Developer"],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRolePackRepository(packs: RolePack[] = []): RolePackRepository {
  return {
    getAll: vi.fn().mockResolvedValue(packs),
    getById: vi.fn(),
  };
}

describe("getRolePacks", () => {
  it("returns all packs from the repository", async () => {
    const packs = [makePack(), makePack({ id: "pack-2", name: "Frontend Pack" })];
    const rolePackRepository = makeRolePackRepository(packs);

    const result = await getRolePacks({ rolePackRepository });

    expect(result).toEqual(packs);
    expect(rolePackRepository.getAll).toHaveBeenCalledOnce();
  });

  it("returns an empty array when no packs exist", async () => {
    const rolePackRepository = makeRolePackRepository([]);

    const result = await getRolePacks({ rolePackRepository });

    expect(result).toEqual([]);
  });
});
