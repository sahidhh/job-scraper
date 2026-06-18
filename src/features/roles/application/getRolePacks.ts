import type { RolePackRepository } from "@/features/roles/domain/RolePackRepository";
import type { RolePack } from "@/features/roles/domain/types";

export interface GetRolePacksDeps {
  rolePackRepository: RolePackRepository;
}

export async function getRolePacks(deps: GetRolePacksDeps): Promise<RolePack[]> {
  return deps.rolePackRepository.getAll();
}
