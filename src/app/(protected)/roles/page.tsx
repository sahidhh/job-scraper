import { RolePackSelector } from "@/components/roles/RolePackSelector";
import { RoleSelectorForm } from "@/components/roles/RoleSelectorForm";
import { SupabaseRolePackRepository } from "@/features/roles/infrastructure/SupabaseRolePackRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function RolesPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const rolePackRepository = new SupabaseRolePackRepository(client);

  const [activeSelection, packs] = await Promise.all([
    roleRepository.getActiveSelection(),
    rolePackRepository.getAll(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Role selection</h1>
        <p className="text-sm text-muted-foreground">
          Choose a role pack or enter a custom role to set the active selection used for scoring.
        </p>
      </div>
      <RolePackSelector packs={packs} activeSelection={activeSelection} />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or enter a custom role</span>
        </div>
      </div>
      <RoleSelectorForm activeSelection={activeSelection} />
    </div>
  );
}
