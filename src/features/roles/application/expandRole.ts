import type { RoleExpansionProvider } from "@/features/roles/domain/RoleExpansionProvider";
import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import type { RoleExpansion } from "@/features/roles/domain/types";
import {
  normalizeRoleName,
  validateExpandedRoles,
  validatePrimaryRole,
} from "@/features/roles/domain/validation";

export interface ExpandRoleDeps {
  roleRepository: RoleRepository;
  expansionProvider: RoleExpansionProvider;
}

/**
 * Role expansion with cache-then-AI-fallback (architecture.md §3.4,
 * decisions.md AD-06). A role not found in role_expansion_map triggers
 * one AI call, whose result is cached for every future lookup of the
 * same normalized role.
 */
export async function expandRole(
  primaryRole: string,
  deps: ExpandRoleDeps,
): Promise<RoleExpansion> {
  validatePrimaryRole(primaryRole);
  const normalized = normalizeRoleName(primaryRole);

  const cached = await deps.roleRepository.getExpansion(normalized);
  if (cached) {
    return cached;
  }

  const relatedRoles = await deps.expansionProvider.expand(primaryRole);
  validateExpandedRoles(relatedRoles);

  await deps.roleRepository.saveExpansion(normalized, relatedRoles, "ai");

  return { relatedRoles, source: "ai" };
}
