import type { RolePackRepository } from "@/features/roles/domain/RolePackRepository";
import type { RolePack } from "@/features/roles/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

export class SupabaseRolePackRepository implements RolePackRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getAll(): Promise<RolePack[]> {
    const { data: packs, error: packsError } = await this.client
      .from("role_packs")
      .select("*")
      .order("created_at", { ascending: true });

    if (packsError) throw toAppError(packsError);
    if (!packs || packs.length === 0) return [];

    const packIds = packs.map((p) => p.id);

    const { data: packRoles, error: rolesError } = await this.client
      .from("role_pack_roles")
      .select("*")
      .in("pack_id", packIds)
      .order("sort_order", { ascending: true });

    if (rolesError) throw toAppError(rolesError);

    const rolesByPackId = new Map<string, string[]>();
    for (const row of packRoles ?? []) {
      const existing = rolesByPackId.get(row.pack_id) ?? [];
      existing.push(row.role);
      rolesByPackId.set(row.pack_id, existing);
    }

    return packs.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      roles: rolesByPackId.get(p.id) ?? [],
      createdAt: p.created_at,
    }));
  }

  async getById(id: string): Promise<RolePack | null> {
    const { data: pack, error: packError } = await this.client
      .from("role_packs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (packError) throw toAppError(packError);
    if (!pack) return null;

    const { data: packRoles, error: rolesError } = await this.client
      .from("role_pack_roles")
      .select("*")
      .eq("pack_id", id)
      .order("sort_order", { ascending: true });

    if (rolesError) throw toAppError(rolesError);

    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      roles: (packRoles ?? []).map((r) => r.role),
      createdAt: pack.created_at,
    };
  }
}
