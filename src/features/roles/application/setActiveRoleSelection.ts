import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import type { RoleSelection } from "@/features/roles/domain/types";
import { validateExpandedRoles, validatePrimaryRole } from "@/features/roles/domain/validation";

export interface SetActiveRoleSelectionDeps {
  roleRepository: RoleRepository;
}

// Activates a new role selection, atomically deactivating the previous one
// (architecture.md §3.4, decisions.md AD-09).
export async function setActiveRoleSelection(
  primaryRole: string,
  expandedRoles: string[],
  deps: SetActiveRoleSelectionDeps,
): Promise<RoleSelection> {
  validatePrimaryRole(primaryRole);
  validateExpandedRoles(expandedRoles);

  return deps.roleRepository.setActiveSelection(primaryRole, expandedRoles);
}
