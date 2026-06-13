import { describe, expect, it, vi } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseRoleRepository } from "./SupabaseRoleRepository";

type RoleExpansionRow = Database["public"]["Tables"]["role_expansion_map"]["Row"];
type RoleSelectionRow = Database["public"]["Tables"]["role_selections"]["Row"];

const expansionRow: RoleExpansionRow = {
  role: "software engineer",
  related_roles: ["backend engineer", "platform engineer"],
  source: "seed",
  updated_at: "2026-01-01T00:00:00Z",
};

const selectionRow: RoleSelectionRow = {
  id: "selection-1",
  primary_role: "Software Engineer",
  expanded_roles: ["Backend Engineer", "Platform Engineer"],
  created_at: "2026-01-01T00:00:00Z",
  is_active: true,
};

describe("SupabaseRoleRepository", () => {
  it("getExpansion returns relatedRoles + source", async () => {
    const { client, builder } = mockSupabaseClient({ data: expansionRow, error: null });
    const repo = new SupabaseRoleRepository(client);

    const result = await repo.getExpansion("software engineer");

    expect(result).toEqual({ relatedRoles: ["backend engineer", "platform engineer"], source: "seed" });
    expect(builder.eq).toHaveBeenCalledWith("role", "software engineer");
  });

  it("getExpansion returns null on cache miss", async () => {
    const { client } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseRoleRepository(client);

    expect(await repo.getExpansion("unknown role")).toBeNull();
  });

  it("saveExpansion upserts onConflict 'role'", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseRoleRepository(client);

    await repo.saveExpansion("software engineer", ["backend engineer"], "ai");

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "software engineer",
        related_roles: ["backend engineer"],
        source: "ai",
      }),
      { onConflict: "role" },
    );
  });

  it("getActiveSelection maps the active row", async () => {
    const { client, builder } = mockSupabaseClient({ data: selectionRow, error: null });
    const repo = new SupabaseRoleRepository(client);

    const result = await repo.getActiveSelection();

    expect(result).toEqual({
      id: "selection-1",
      primaryRole: "Software Engineer",
      expandedRoles: ["Backend Engineer", "Platform Engineer"],
      createdAt: "2026-01-01T00:00:00Z",
      isActive: true,
    });
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("setActiveSelection calls the RPC and maps the first returned row", async () => {
    const { client } = mockSupabaseClient({ data: [selectionRow], error: null });
    const repo = new SupabaseRoleRepository(client);

    const result = await repo.setActiveSelection("Software Engineer", ["Backend Engineer", "Platform Engineer"]);

    expect(result.id).toBe("selection-1");
    expect(vi.mocked(client.rpc)).toHaveBeenCalledWith("set_active_role_selection", {
      p_primary_role: "Software Engineer",
      p_expanded_roles: ["Backend Engineer", "Platform Engineer"],
    });
  });

  it("setActiveSelection throws if the RPC returns no rows", async () => {
    const { client } = mockSupabaseClient({ data: [], error: null });
    const repo = new SupabaseRoleRepository(client);

    await expect(repo.setActiveSelection("Software Engineer", [])).rejects.toThrow(
      "set_active_role_selection returned no row",
    );
  });
});
