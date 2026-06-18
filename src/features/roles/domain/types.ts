import type { RoleMapSource } from "@/shared/domain/enums";

// Mirrors the `role_selections` table (database.md §2).
export interface RoleSelection {
  id: string;
  primaryRole: string;
  expandedRoles: string[];
  createdAt: string; // ISO 8601
  isActive: boolean;
}

// Result of roles.application.expandRole() -- either a hit on
// role_expansion_map (source='seed'|'ai') or a fresh AI-generated
// expansion about to be cached (architecture.md §3.4).
export interface RoleExpansion {
  relatedRoles: string[];
  source: RoleMapSource;
}

// Mirrors role_packs + role_pack_roles (docs/tasks/role-packs.md).
export interface RolePack {
  id: string;
  name: string;
  description: string;
  roles: string[]; // ordered by sort_order
  createdAt: string; // ISO 8601
}
