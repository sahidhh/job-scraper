import { RoleSelectorForm } from "@/components/roles/RoleSelectorForm";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

export default async function RolesPage() {
  const client = await createSupabaseServerClient();
  const roleRepository = new SupabaseRoleRepository(client);
  const activeSelection = await roleRepository.getActiveSelection();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Role selection</h1>
        <p className="text-sm text-muted-foreground">
          Enter a primary role to see related roles, then confirm to set the active selection used for scoring.
        </p>
      </div>
      <RoleSelectorForm activeSelection={activeSelection} />
    </div>
  );
}
