import type { RoleMapSource } from "@/shared/domain/enums";
import type { RoleExpansion, RoleSelection } from "./types";

export interface RoleRepository {
  /** role_expansion_map lookup by normalized role name (normalizeRoleName). */
  getExpansion(role: string): Promise<RoleExpansion | null>;

  /** Upsert into role_expansion_map (cache write, e.g. after an AI fallback). */
  saveExpansion(role: string, relatedRoles: string[], source: RoleMapSource): Promise<void>;

  getActiveSelection(): Promise<RoleSelection | null>;

  /**
   * Inserts the new selection as active and deactivates the previous
   * active one, atomically (set_active_role_selection RPC,
   * decisions.md AD-09).
   */
  setActiveSelection(primaryRole: string, expandedRoles: string[]): Promise<RoleSelection>;
}
