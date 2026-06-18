import type { RolePackRepository } from "@/features/roles/domain/RolePackRepository";
import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import type { RoleSelection } from "@/features/roles/domain/types";
import { DomainValidationError } from "@/shared/domain/errors";
import { setActiveRoleSelection } from "./setActiveRoleSelection";

export interface ActivateRolePackDeps {
  rolePackRepository: RolePackRepository;
  roleRepository: RoleRepository;
}

// Loads the pack by id, then delegates to the existing setActiveRoleSelection
// use-case so the scrape/score/notify pipelines are unaffected.
export async function activateRolePack(
  packId: string,
  deps: ActivateRolePackDeps,
): Promise<RoleSelection> {
  if (!packId.trim()) {
    throw new DomainValidationError("packId must not be empty");
  }

  const pack = await deps.rolePackRepository.getById(packId);
  if (!pack) {
    throw new DomainValidationError(`Role pack not found: ${packId}`);
  }

  return setActiveRoleSelection(pack.name, pack.roles, {
    roleRepository: deps.roleRepository,
  });
}
