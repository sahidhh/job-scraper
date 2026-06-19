import { describe, expect, it } from "vitest";
import { mockSupabaseClient } from "@/shared/infrastructure/testing/supabaseQueryMock";
import type { Database } from "../../../../supabase/database.types";
import { SupabaseCompanyRepository } from "./SupabaseCompanyRepository";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];

const row: CompanyRow = {
  id: "company-1",
  name: "Acme",
  source: "greenhouse",
  board_token: "acme",
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  health_status: "active",
  consecutive_failures: 0,
  last_success_at: null,
  last_failure_at: null,
};

describe("SupabaseCompanyRepository", () => {
  it("listActive maps rows and filters by active=true (and optionally source)", async () => {
    const { client, builder } = mockSupabaseClient({ data: [row], error: null });
    const repo = new SupabaseCompanyRepository(client);

    const result = await repo.listActive("greenhouse");

    expect(result).toEqual([
      {
        id: "company-1",
        name: "Acme",
        source: "greenhouse",
        boardToken: "acme",
        active: true,
        createdAt: "2026-01-01T00:00:00Z",
        healthStatus: "active",
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
      },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("active", true);
    expect(builder.eq).toHaveBeenCalledWith("source", "greenhouse");
  });

  it("list returns all companies without an active filter", async () => {
    const { client, builder } = mockSupabaseClient({ data: [row], error: null });
    const repo = new SupabaseCompanyRepository(client);

    const result = await repo.list();

    expect(result).toHaveLength(1);
    expect(builder.eq).not.toHaveBeenCalled();
  });

  it("create inserts a new company and maps the returned row", async () => {
    const { client, builder } = mockSupabaseClient({ data: row, error: null });
    const repo = new SupabaseCompanyRepository(client);

    const result = await repo.create({ name: "Acme", source: "greenhouse", boardToken: "acme" });

    expect(result.id).toBe("company-1");
    expect(builder.insert).toHaveBeenCalledWith({
      name: "Acme",
      source: "greenhouse",
      board_token: "acme",
      active: true,
    });
  });

  it("update only includes provided fields", async () => {
    const { client, builder } = mockSupabaseClient({ data: { ...row, active: false }, error: null });
    const repo = new SupabaseCompanyRepository(client);

    const result = await repo.update("company-1", { active: false });

    expect(result.active).toBe(false);
    expect(builder.update).toHaveBeenCalledWith({ active: false });
    expect(builder.eq).toHaveBeenCalledWith("id", "company-1");
  });

  it("remove deletes by id", async () => {
    const { client, builder } = mockSupabaseClient({ data: null, error: null });
    const repo = new SupabaseCompanyRepository(client);

    await repo.remove("company-1");

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "company-1");
  });

  it("throws the underlying error", async () => {
    const { client } = mockSupabaseClient({ data: null, error: { message: "boom" } });
    const repo = new SupabaseCompanyRepository(client);

    await expect(repo.list()).rejects.toEqual({ message: "boom" });
  });
});
