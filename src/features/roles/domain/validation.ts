import { DomainValidationError } from "@/shared/domain/errors";
import { assertNonEmpty } from "@/shared/domain/validation";

// Canonical cache key for role_expansion_map (database.md §2: "normalized
// lowercase"). Used for both lookups and writes.
export function normalizeRoleName(role: string): string {
  return role.trim().toLowerCase();
}

export function validatePrimaryRole(role: string): void {
  assertNonEmpty(role, "primaryRole");
}

export function validateExpandedRoles(roles: string[]): void {
  if (roles.length === 0) {
    throw new DomainValidationError("expandedRoles must contain at least one role");
  }
  for (const role of roles) {
    assertNonEmpty(role, "expandedRoles entry");
  }
}
