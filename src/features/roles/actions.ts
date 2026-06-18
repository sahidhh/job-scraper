"use server";

import { revalidatePath } from "next/cache";
import { activateRolePack } from "@/features/roles/application/activateRolePack";
import { expandRole } from "@/features/roles/application/expandRole";
import { getRolePacks } from "@/features/roles/application/getRolePacks";
import { setActiveRoleSelection } from "@/features/roles/application/setActiveRoleSelection";
import type { RoleExpansion, RolePack, RoleSelection } from "@/features/roles/domain/types";
import { OpenRouterRoleExpansionProvider } from "@/features/roles/infrastructure/OpenRouterRoleExpansionProvider";
import { SupabaseRolePackRepository } from "@/features/roles/infrastructure/SupabaseRolePackRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

// frontend.md §3 -- preview only, does not activate the selection.
export async function expandRoleAction(primaryRole: string): Promise<ActionResult<RoleExpansion>> {
  try {
    const client = await createSupabaseServerClient();
    const roleRepository = new SupabaseRoleRepository(client);
    const expansionProvider = new OpenRouterRoleExpansionProvider();

    const result = await expandRole(primaryRole, { roleRepository, expansionProvider });
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// frontend.md §3 -- atomic activation (set_active_role_selection RPC),
// revalidates /dashboard and /roles.
export async function confirmRoleSelectionAction(
  primaryRole: string,
  expandedRoles: string[],
): Promise<ActionResult<RoleSelection>> {
  try {
    const client = await createSupabaseServerClient();
    const roleRepository = new SupabaseRoleRepository(client);

    const result = await setActiveRoleSelection(primaryRole, expandedRoles, { roleRepository });
    revalidatePath("/dashboard");
    revalidatePath("/roles");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function getRolePacksAction(): Promise<ActionResult<RolePack[]>> {
  try {
    const client = await createSupabaseServerClient();
    const rolePackRepository = new SupabaseRolePackRepository(client);

    const result = await getRolePacks({ rolePackRepository });
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// Loads the pack's roles and activates them via the existing role selection flow.
// The scrape/score/notify pipelines are unaffected (docs/tasks/role-packs.md).
export async function activateRolePackAction(packId: string): Promise<ActionResult<RoleSelection>> {
  try {
    const client = await createSupabaseServerClient();
    const rolePackRepository = new SupabaseRolePackRepository(client);
    const roleRepository = new SupabaseRoleRepository(client);

    const result = await activateRolePack(packId, { rolePackRepository, roleRepository });
    revalidatePath("/dashboard");
    revalidatePath("/roles");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
