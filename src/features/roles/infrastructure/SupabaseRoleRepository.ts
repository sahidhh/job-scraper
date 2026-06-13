import type { RoleMapSource } from "@/shared/domain/enums";
import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import type { RoleExpansion, RoleSelection } from "@/features/roles/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Database } from "../../../../supabase/database.types";

type RoleSelectionRow = Database["public"]["Tables"]["role_selections"]["Row"];

function toRoleSelection(row: RoleSelectionRow): RoleSelection {
  return {
    id: row.id,
    primaryRole: row.primary_role,
    expandedRoles: row.expanded_roles,
    createdAt: row.created_at,
    isActive: row.is_active,
  };
}

// repositories.md §4.
export class SupabaseRoleRepository implements RoleRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getExpansion(role: string): Promise<RoleExpansion | null> {
    const { data, error } = await this.client.from("role_expansion_map").select("*").eq("role", role).maybeSingle();

    if (error) throw error;
    return data ? { relatedRoles: data.related_roles, source: data.source } : null;
  }

  async saveExpansion(role: string, relatedRoles: string[], source: RoleMapSource): Promise<void> {
    const { error } = await this.client.from("role_expansion_map").upsert(
      {
        role,
        related_roles: relatedRoles,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "role" },
    );

    if (error) throw error;
  }

  async getActiveSelection(): Promise<RoleSelection | null> {
    const { data, error } = await this.client.from("role_selections").select("*").eq("is_active", true).maybeSingle();

    if (error) throw error;
    return data ? toRoleSelection(data) : null;
  }

  // Atomic deactivate-previous + insert-new via set_active_role_selection RPC
  // (decisions.md AD-09).
  async setActiveSelection(primaryRole: string, expandedRoles: string[]): Promise<RoleSelection> {
    const { data, error } = await this.client.rpc("set_active_role_selection", {
      p_primary_role: primaryRole,
      p_expanded_roles: expandedRoles,
    });

    if (error) throw error;

    const row = data?.[0];
    if (!row) throw new Error("set_active_role_selection returned no row");
    return toRoleSelection(row);
  }
}
